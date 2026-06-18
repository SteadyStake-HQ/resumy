import { promises as fs } from "fs";
import path from "path";
import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  buildEditorHtmlFromResume,
  generateEditorDocx,
  generateEditorPdf,
  generateRawHtmlPdf,
} from "@/lib/editor-document";
import { toSafeGeneration } from "@/lib/generation";
import { connectToDatabase } from "@/lib/db";
import { normalizeResumeDocumentStyle } from "@/lib/resume-document-style";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

export const runtime = "nodejs";

type EditorExportBody = {
  format?: string;
  html?: string;
  editorHtml?: string;
  documentStyle?: unknown;
  /** When true, `html` is a complete <!doctype html> document — skip the
   *  wrapEditorHtmlDocument wrapper and pass it straight to Puppeteer. */
  rawHtmlDocument?: boolean;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  if (!id || !Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid generation id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as EditorExportBody | null;
  const format = body?.format === "docx" ? "docx" : body?.format === "pdf" ? "pdf" : "";
  const rawHtmlDocument = body?.rawHtmlDocument === true;

  if (!format) {
    return NextResponse.json(
      { error: "Please choose PDF or DOCX export." },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const generation = await Generation.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!generation) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  const submittedHtml =
    typeof body?.html === "string" && body.html.trim() ? body.html : null;
  const savedEditorHtml =
    rawHtmlDocument && typeof body?.editorHtml === "string" && body.editorHtml.trim()
      ? body.editorHtml
      : submittedHtml ??
        generation.editorHtml ??
        (await buildEditorHtmlFromResume(generation.tailoredData));
  const renderHtml = submittedHtml ?? savedEditorHtml;
  const documentStyle = normalizeResumeDocumentStyle(body?.documentStyle);
  const [sourceResume, jobDescription] = await Promise.all([
    Resume.findById(generation.sourceResumeId).select("fileName").lean(),
    generation.jobDescriptionId
      ? JobDescription.findById(generation.jobDescriptionId)
          .select("title company")
          .lean()
      : Promise.resolve(null),
  ]);

  let outputBuffer: Uint8Array;
  try {
    if (format === "pdf") {
      outputBuffer =
        rawHtmlDocument && submittedHtml
          ? await generateRawHtmlPdf(submittedHtml)
          : await generateEditorPdf(renderHtml, documentStyle);
    } else {
      outputBuffer = await generateEditorDocx(renderHtml, documentStyle);
    }
  } catch (error) {
    console.error("Editor export rendering error", error);
    return NextResponse.json(
      {
        error:
          format === "pdf"
            ? "High-fidelity PDF export could not start because Chromium is unavailable on this machine."
            : "DOCX export could not render this edited resume.",
      },
      { status: 500 },
    );
  }

  const outputDirectory = path.join(
    process.cwd(),
    "public",
    "generated",
    session.user.id,
  );
  const fileName = [
    generation._id.toString(),
    slugify(sourceResume?.fileName ?? "resume"),
    "editor",
    Date.now().toString(),
  ]
    .filter(Boolean)
    .join("-");
  const outputFileName = `${fileName}.${format}`;
  const outputPath = path.join(outputDirectory, outputFileName);

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, outputBuffer);

  const outputUrl = `/generated/${session.user.id}/${outputFileName}`;
  const updatedGeneration = await Generation.findByIdAndUpdate(
    generation._id,
    {
      editorHtml: savedEditorHtml,
      editorDocumentStyle: documentStyle,
      generatedFiles: {
        pdfUrl: format === "pdf" ? outputUrl : generation.generatedFiles?.pdfUrl ?? null,
        docxUrl: format === "docx" ? outputUrl : generation.generatedFiles?.docxUrl ?? null,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  ).lean();

  return NextResponse.json({
    url: outputUrl,
    generation: updatedGeneration
      ? toSafeGeneration(updatedGeneration, {
          sourceResume: sourceResume
            ? { id: sourceResume._id.toString(), fileName: sourceResume.fileName }
            : null,
          jobDescription: jobDescription
            ? {
                id: jobDescription._id.toString(),
                title: jobDescription.title ?? "",
                company: jobDescription.company ?? "",
              }
            : null,
        })
      : null,
  });
}
