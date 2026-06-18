import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { normalizeAIProvider } from "@/lib/ai-provider";
import {
  askAssistant,
  askAssistantFallback,
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

type AssistantRequestBody = {
  message?: string;
  context?: {
    currentPath?: string;
    resumeId?: string;
    generationId?: string;
    jobDescriptionId?: string;
  };
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rateLimit = checkRateLimit({
    key: `${session.user.id}:assistant:${getRateLimitKeyFromRequest(request)}`,
    limit: 18,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Assistant usage is rate-limited right now. Try again in about ${rateLimit.retryAfterSeconds} seconds.`,
      },
      { status: 429 },
    );
  }

  try {
    const body = (await request.json()) as AssistantRequestBody;
    const message = body.message?.trim() ?? "";

    if (message.length < 2) {
      return NextResponse.json(
        { error: "Please enter a message first." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [user, resume, generation, jobDescription] = await Promise.all([
      User.findById(session.user.id).lean(),
      body.context?.resumeId && Types.ObjectId.isValid(body.context.resumeId)
        ? Resume.findOne({
            _id: body.context.resumeId,
            userId: session.user.id,
          }).lean()
        : Promise.resolve(null),
      body.context?.generationId && Types.ObjectId.isValid(body.context.generationId)
        ? Generation.findOne({
            _id: body.context.generationId,
            userId: session.user.id,
          }).lean()
        : Promise.resolve(null),
      body.context?.jobDescriptionId &&
      Types.ObjectId.isValid(body.context.jobDescriptionId)
        ? JobDescription.findOne({
            _id: body.context.jobDescriptionId,
            userId: session.user.id,
          }).lean()
        : Promise.resolve(null),
    ]);

    if (!user || !hasPremiumAccess(user.membership?.tier)) {
      return NextResponse.json(
        { error: "Premium membership is required for the AI assistant." },
        { status: 403 },
      );
    }

    const assistantContext = {
      currentPath: body.context?.currentPath ?? "",
      membershipTier: user.membership?.tier ?? "free",
      resumeData: generation?.tailoredData ?? resume?.parsedData ?? null,
      jobDescription:
        jobDescription?.content ??
        (generation?.jobDescriptionId
          ? (
              await JobDescription.findById(generation.jobDescriptionId)
                .select("content")
                .lean()
            )?.content ?? ""
          : ""),
      generationLabel: generation
        ? generation._id.toString()
        : resume?.fileName ?? null,
    };

    let reply = "";
    const preferredAI = normalizeAIProvider(user.settings?.preferredAI);
    const geminiRouterIndex = normalizeGeminiRouterIndex(
      user.settings?.preferredGeminiRouterIndex,
    );
    const huggingFaceRouterIndex = normalizeHuggingFaceRouterIndex(
      user.settings?.preferredHuggingFaceRouterIndex,
    );

    try {
      reply = await askAssistant(message, assistantContext, preferredAI, {
        geminiRouterIndex,
        huggingFaceRouterIndex,
      });
    } catch (error) {
      console.warn("Assistant response fell back to deterministic mode.", error);
      reply = askAssistantFallback(message, assistantContext);
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Assistant error", error);

    return NextResponse.json(
      { error: "We couldn't get a response from the assistant." },
      { status: 500 },
    );
  }
}
