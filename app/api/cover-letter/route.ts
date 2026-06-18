import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { normalizeAIProvider } from "@/lib/ai-provider";
import {
  generateCoverLetter,
  generateCoverLetterFallback,
} from "@/lib/aiService";
import { authOptions } from "@/lib/auth";
import { normalizeGeminiRouterIndex } from "@/lib/gemini-router";
import { normalizeHuggingFaceRouterIndex } from "@/lib/huggingface-router";
import { hasPremiumAccess } from "@/lib/membership";
import { connectToDatabase } from "@/lib/db";
import {
  checkRateLimit,
  getRateLimitKeyFromRequest,
} from "@/lib/rate-limit";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";
import User from "@/models/User";

type CoverLetterRequestBody = {
  generationId?: string;
  resumeId?: string;
  jobDescriptionId?: string;
  jobDescription?: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rateLimit = checkRateLimit({
    key: `${session.user.id}:cover-letter:${getRateLimitKeyFromRequest(request)}`,
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Cover letter generation is rate-limited right now. Try again in about ${rateLimit.retryAfterSeconds} seconds.`,
      },
      { status: 429 },
    );
  }

  try {
    const body = (await request.json()) as CoverLetterRequestBody;
    const generationId = body.generationId?.trim() ?? "";
    const resumeId = body.resumeId?.trim() ?? "";
    const jobDescriptionId = body.jobDescriptionId?.trim() ?? "";
    const directJobDescription = body.jobDescription?.trim() ?? "";

    if (!generationId && !resumeId) {
      return NextResponse.json(
        { error: "Please choose a resume or generation first." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [user, generation, resume, savedJobDescription] = await Promise.all([
      User.findById(session.user.id).lean(),
      generationId && Types.ObjectId.isValid(generationId)
        ? Generation.findOne({ _id: generationId, userId: session.user.id }).lean()
        : Promise.resolve(null),
      resumeId && Types.ObjectId.isValid(resumeId)
        ? Resume.findOne({ _id: resumeId, userId: session.user.id }).lean()
        : Promise.resolve(null),
      jobDescriptionId && Types.ObjectId.isValid(jobDescriptionId)
        ? JobDescription.findOne({
            _id: jobDescriptionId,
            userId: session.user.id,
          }).lean()
        : Promise.resolve(null),
    ]);

    if (!user || !hasPremiumAccess(user.membership?.tier)) {
      return NextResponse.json(
        { error: "Premium membership is required for cover letters." },
        { status: 403 },
      );
    }

    const effectiveResumeData = generation?.tailoredData ?? resume?.parsedData ?? null;
    const effectiveJobDescription =
      directJobDescription || savedJobDescription?.content || "";

    if (!effectiveResumeData) {
      return NextResponse.json(
        { error: "The selected resume or generation was not found." },
        { status: 404 },
      );
    }

    if (!effectiveJobDescription) {
      return NextResponse.json(
        { error: "Please provide a job description first." },
        { status: 400 },
      );
    }

    const preferredAI = normalizeAIProvider(user.settings?.preferredAI);
    const geminiRouterIndex = normalizeGeminiRouterIndex(
      user.settings?.preferredGeminiRouterIndex,
    );
    const huggingFaceRouterIndex = normalizeHuggingFaceRouterIndex(
      user.settings?.preferredHuggingFaceRouterIndex,
    );
    let coverLetter = "";
    let model: string = preferredAI;

    try {
      coverLetter = await generateCoverLetter(
        effectiveResumeData,
        effectiveJobDescription,
        preferredAI,
        { geminiRouterIndex, huggingFaceRouterIndex },
      );
    } catch (error) {
      console.warn("Cover letter generation fell back to deterministic mode.", error);
      coverLetter = generateCoverLetterFallback(
        effectiveResumeData,
        effectiveJobDescription,
      );
      model = `${model}-fallback`;
    }

    return NextResponse.json({
      coverLetter,
      aiModelUsed: model,
    });
  } catch (error) {
    console.error("Cover letter error", error);

    return NextResponse.json(
      { error: "We couldn't generate the cover letter." },
      { status: 500 },
    );
  }
}
