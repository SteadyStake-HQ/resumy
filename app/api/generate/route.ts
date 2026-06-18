import { promises as fs } from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { normalizeResumeCustomization } from "@/lib/design-template";
import {
  toDesignTemplateSummary,
  toSafeGeneration,
} from "@/lib/generation";
import { connectToDatabase } from "@/lib/db";
import { generateDOCX, generatePDF } from "@/lib/renderer";
import { findDesignTemplate } from "@/lib/templates";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

type GenerateRequestBody = {
  generationId?: string;
  templateId?: string;
  customization?: Record<string, unknown>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as GenerateRequestBody;
    const generationId = body.generationId?.trim() ?? "";
    const templateId = body.templateId?.trim() ?? "";

    if (!/^[0-9a-fA-F]{24}$/.test(generationId)) {
      return NextResponse.json(
        { error: "Please choose a valid generation." },
        { status: 400 },
      );
    }

    if (!templateId) {
      return NextResponse.json(
        { error: "Please choose a design template." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const generation = await Generation.findOne({
      _id: generationId,
      userId: session.user.id,
    }).lean();

    if (!generation) {
      return NextResponse.json(
        { error: "Generation not found." },
        { status: 404 },
      );
    }

    const template = await findDesignTemplate(templateId);

    if (!template) {
      return NextResponse.json(
        { error: "Design template not found." },
        { status: 404 },
      );
    }

    const customization = normalizeResumeCustomization(
      body.customization ?? {},
      template.config,
    );
    const [sourceResume, jobDescription, pdfBuffer, docxBuffer] = await Promise.all([
      Resume.findById(generation.sourceResumeId).select("fileName").lean(),
      generation.jobDescriptionId
        ? JobDescription.findById(generation.jobDescriptionId)
            .select("title company")
            .lean()
        : Promise.resolve(null),
      generatePDF(generation.tailoredData, template.id, customization),
      generateDOCX(generation.tailoredData, template.id, customization),
    ]);

    const outputDirectory = path.join(
      process.cwd(),
      "public",
      "generated",
      session.user.id,
    );
    const fileStem = [
      generation._id.toString(),
      slugify(sourceResume?.fileName ?? "resume"),
      template.slug,
      Date.now().toString(),
    ]
      .filter(Boolean)
      .join("-");
    const pdfFileName = `${fileStem}.pdf`;
    const docxFileName = `${fileStem}.docx`;
    const pdfPath = path.join(outputDirectory, pdfFileName);
    const docxPath = path.join(outputDirectory, docxFileName);

    await fs.mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(pdfPath, pdfBuffer),
      fs.writeFile(docxPath, docxBuffer),
    ]);

    const pdfUrl = `/generated/${session.user.id}/${pdfFileName}`;
    const docxUrl = `/generated/${session.user.id}/${docxFileName}`;
    const updatedGeneration = await Generation.findByIdAndUpdate(
      generation._id,
      {
        designTemplateId: template.id,
        customization,
        generatedFiles: {
          pdfUrl,
          docxUrl,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    ).lean();

    return NextResponse.json({
      pdfUrl,
      docxUrl,
      generation: updatedGeneration
        ? toSafeGeneration(updatedGeneration, {
            sourceResume: sourceResume
              ? {
                  id: sourceResume._id.toString(),
                  fileName: sourceResume.fileName,
                }
              : null,
            jobDescription: jobDescription
              ? {
                  id: jobDescription._id.toString(),
                  title: jobDescription.title ?? "",
                  company: jobDescription.company ?? "",
                }
              : null,
            designTemplate: toDesignTemplateSummary(template),
          })
        : null,
    });
  } catch (error) {
    console.error("Generation export error", error);

    return NextResponse.json(
      { error: "We couldn't generate those download files." },
      { status: 500 },
    );
  }
}
