import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  analyzeResumeWithAI,
  refreshResumeSectionWithAI,
  type AIExecutionOptions,
} from "@/lib/aiService";
import { normalizeAIProvider } from "@/lib/ai-provider";
import { normalizeGeminiRouterIndex } from "@/lib/gemini-router";
import { connectToDatabase } from "@/lib/db";
import {
  createEmptyResumeExtractionMeta,
  RESUME_SECTION_KEYS,
  type ResumeSectionKey,
  toSafeResume,
} from "@/lib/resume";
import {
  analyzeResumeFallback,
  extractResumeTextFromFile,
} from "@/lib/resume-processing";
import { normalizeHuggingFaceRouterIndex } from "@/lib/huggingface-router";
import BackgroundTask from "@/models/BackgroundTask";
import Resume from "@/models/Resume";
import User from "@/models/User";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid resume id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { section?: string }
    | null;
  const section = body?.section?.trim() as ResumeSectionKey | undefined;

  if (!section || !RESUME_SECTION_KEYS.includes(section)) {
    return NextResponse.json({ error: "Invalid section." }, { status: 400 });
  }

  await connectToDatabase();

  const [resume, user] = await Promise.all([
    Resume.findOne({ _id: id, userId: session.user.id }),
    User.findById(session.user.id).select("settings").lean(),
  ]);

  if (!resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  let rawText = resume.rawText?.trim() || "";

  if (!rawText) {
    const sourceTask = await BackgroundTask.findOne({
      userId: session.user.id,
      resultResumeId: resume._id,
      type: "resume_analysis",
      "sourceFile.buffer": { $exists: true },
    })
      .sort({ createdAt: -1 })
      .select("fileName sourceFile")
      .lean();

    if (sourceTask?.sourceFile?.buffer?.length) {
      const file = new File(
        [new Uint8Array(sourceTask.sourceFile.buffer)],
        sourceTask.fileName || resume.fileName,
        { type: sourceTask.sourceFile.mimeType || "application/octet-stream" },
      );
      rawText = await extractResumeTextFromFile(file);
    }
  }

  if (!rawText) {
    return NextResponse.json(
      { error: "This resume does not have saved raw text for section refresh." },
      { status: 409 },
    );
  }

  const preferredAI = normalizeAIProvider(user?.settings?.preferredAI);
  const options: AIExecutionOptions = {
    geminiRouterIndex: normalizeGeminiRouterIndex(
      user?.settings?.preferredGeminiRouterIndex,
    ),
    huggingFaceRouterIndex: normalizeHuggingFaceRouterIndex(
      user?.settings?.preferredHuggingFaceRouterIndex,
    ),
  };

  const refreshed = await refreshResumeSectionWithAI(
    resume.parsedData,
    rawText,
    section,
    preferredAI,
    options,
  );

  let analysisReport = analyzeResumeFallback(refreshed.parsedData, rawText);

  try {
    analysisReport = await analyzeResumeWithAI(
      refreshed.parsedData,
      rawText,
      preferredAI,
      options,
      refreshed.extractionAudit,
    );
  } catch {
    // keep fallback analysis
  }

  const nextExtractionMeta = {
    ...(resume.extractionMeta ?? createEmptyResumeExtractionMeta()),
    rawTextAvailable: true,
    sections: {
      ...(resume.extractionMeta?.sections ?? createEmptyResumeExtractionMeta().sections),
      [section]: refreshed.extractionMeta.sections[section],
    },
  };

  resume.rawText = rawText;
  resume.parsedData = refreshed.parsedData;
  resume.analysisReport = analysisReport;
  resume.extractionMeta = nextExtractionMeta;
  await resume.save();

  return NextResponse.json({ resume: toSafeResume(resume) });
}
