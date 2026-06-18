import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  createResumeTailoringTask,
  enqueueResumeTailoringTask,
} from "@/lib/background-task-service";
import {
  checkRateLimit,
  getRateLimitKeyFromRequest,
} from "@/lib/rate-limit";
import { connectToDatabase } from "@/lib/db";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

type TailorResumeRequestBody = {
  resumeId?: string;
  title?: string;
  company?: string;
  jobDescription?: string;
  jobDescriptionId?: string;
  clientTaskId?: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rateLimit = checkRateLimit({
    key: `${session.user.id}:tailor:${getRateLimitKeyFromRequest(request)}`,
    limit: 16,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Resume tailoring is rate-limited right now. Try again in about ${rateLimit.retryAfterSeconds} seconds.`,
      },
      { status: 429 },
    );
  }

  try {
    const body = (await request.json()) as TailorResumeRequestBody;
    const resumeId = body.resumeId?.trim();
    const jobTitle = body.title?.trim() ?? "";
    const jobCompany = body.company?.trim() ?? "";
    const jobDescriptionId = body.jobDescriptionId?.trim();
    const directJobDescription = body.jobDescription?.trim();
    const clientTaskId = body.clientTaskId?.trim();

    if (!resumeId || !Types.ObjectId.isValid(resumeId)) {
      return NextResponse.json(
        { error: "Please choose a valid resume." },
        { status: 400 },
      );
    }

    if (!jobDescriptionId && !directJobDescription) {
      return NextResponse.json(
        { error: "Please provide a job description." },
        { status: 400 },
      );
    }

    if (jobDescriptionId && !Types.ObjectId.isValid(jobDescriptionId)) {
      return NextResponse.json(
        { error: "Please choose a valid saved job description." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [resume, savedJobDescription] = await Promise.all([
      Resume.findOne({ _id: resumeId, userId: session.user.id })
        .select("_id fileName")
        .lean(),
      jobDescriptionId
        ? JobDescription.findOne({
            _id: jobDescriptionId,
            userId: session.user.id,
          })
            .select("_id content title company")
            .lean()
        : Promise.resolve(null),
    ]);

    if (!resume) {
      return NextResponse.json({ error: "Resume not found." }, { status: 404 });
    }

    if (jobDescriptionId && !savedJobDescription) {
      return NextResponse.json(
        { error: "Job description not found." },
        { status: 404 },
      );
    }

    const jobDescriptionContent =
      savedJobDescription?.content ?? directJobDescription ?? "";

    const task = await createResumeTailoringTask({
      userId: session.user.id,
      resumeId,
      resumeFileName: resume.fileName,
      jobDescriptionContent,
      savedJobDescriptionId: savedJobDescription?._id?.toString() ?? null,
      jobTitle: savedJobDescription?.title ?? jobTitle,
      jobCompany: savedJobDescription?.company ?? jobCompany,
      clientTaskId,
    });

    void enqueueResumeTailoringTask(task.id).catch((error) => {
      console.error("Resume tailoring enqueue failed after task creation", {
        taskId: task.id,
        error,
      });
    });

    return NextResponse.json(
      {
        task,
        initialStatus: task.status,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Tailor resume error", error);

    const detail =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : "Something went wrong while queuing the tailoring task.";

    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
