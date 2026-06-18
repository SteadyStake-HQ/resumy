import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { toSafeGeneration } from "@/lib/generation";
import { connectToDatabase } from "@/lib/db";
import { normalizeResumeDocumentStyle } from "@/lib/resume-document-style";
import { normalizeParsedResumeData } from "@/lib/resume";
import { buildEditorHtmlFromResume } from "@/lib/editor-document";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

export async function GET(
  _request: Request,
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

  await connectToDatabase();

  const generation = await Generation.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!generation) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  const [sourceResume, jobDescription] = await Promise.all([
    Resume.findById(generation.sourceResumeId).select("fileName").lean(),
    generation.jobDescriptionId
      ? JobDescription.findById(generation.jobDescriptionId)
          .select("title company")
          .lean()
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    generation: toSafeGeneration(generation, {
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
    }),
  });
}

export async function PATCH(
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

  const body = (await request.json().catch(() => null)) as {
    tailoredData?: unknown;
    editorHtml?: unknown;
    editorDocumentStyle?: unknown;
    editorTemplateId?: unknown;
  } | null;

  if (
    !body ||
    (!("tailoredData" in body) &&
      !("editorHtml" in body) &&
      !("editorDocumentStyle" in body) &&
      !("editorTemplateId" in body))
  ) {
    return NextResponse.json(
      { error: "Updated resume content is required." },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const update: Record<string, unknown> = {
    generatedFiles: {
      pdfUrl: null,
      docxUrl: null,
    },
  };

  if ("tailoredData" in body) {
    const tailoredData = normalizeParsedResumeData(body.tailoredData);
    update.tailoredData = tailoredData;
    update.editorHtml = await buildEditorHtmlFromResume(tailoredData);
  }

  if (typeof body.editorHtml === "string") {
    update.editorHtml = body.editorHtml;
  }

  if ("editorDocumentStyle" in body) {
    update.editorDocumentStyle = normalizeResumeDocumentStyle(body.editorDocumentStyle);
  }

  if ("editorTemplateId" in body) {
    const editorTemplateId =
      typeof body.editorTemplateId === "string" ? body.editorTemplateId : "base";
    update.editorTemplateId = ["base", "t01", "t02", "t03", "t04", "t05", "t06", "t07", "t08", "t09", "t10"].includes(editorTemplateId)
      ? editorTemplateId
      : "base";
  }

  const updatedGeneration = await Generation.findOneAndUpdate(
    {
      _id: id,
      userId: session.user.id,
    },
    update,
    {
      returnDocument: "after",
      runValidators: true,
    },
  ).lean();

  if (!updatedGeneration) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  const [sourceResume, jobDescription] = await Promise.all([
    Resume.findById(updatedGeneration.sourceResumeId).select("fileName").lean(),
    updatedGeneration.jobDescriptionId
      ? JobDescription.findById(updatedGeneration.jobDescriptionId)
          .select("title company")
          .lean()
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    generation: toSafeGeneration(updatedGeneration, {
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
    }),
  });
}
