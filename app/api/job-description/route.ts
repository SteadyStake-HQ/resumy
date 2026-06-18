import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { analyzeJobDescriptionWithAI } from "@/lib/aiService";
import {
  extractKeywordCandidates,
  toSafeJobDescription,
} from "@/lib/job-description";
import { connectToDatabase } from "@/lib/db";
import JobDescription from "@/models/JobDescription";

type CreateJobDescriptionRequestBody = {
  title?: string;
  company?: string;
  content?: string;
};

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectToDatabase();

  const jobDescriptions = await JobDescription.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    jobDescriptions: jobDescriptions.map((jobDescription) =>
      toSafeJobDescription(jobDescription),
    ),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateJobDescriptionRequestBody;
    const title = body.title?.trim() ?? "";
    const company = body.company?.trim() ?? "";
    const content = body.content?.trim() ?? "";

    if (content.length < 30) {
      return NextResponse.json(
        { error: "Please provide a fuller job description." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const jobDescription = await JobDescription.create({
      userId: session.user.id,
      title,
      company,
      content,
      parsedKeywords: extractKeywordCandidates(content),
      analyzedJobDescription: null,
    });

    // Fire-and-forget: run AI analysis and store the result.
    // This makes it available for the tailoring pipeline without blocking the response.
    const jdId = jobDescription._id;
    void analyzeJobDescriptionWithAI(content)
      .then((analyzed) =>
        JobDescription.findByIdAndUpdate(jdId, {
          $set: { analyzedJobDescription: analyzed },
        }),
      )
      .catch((err) =>
        console.warn("Background JD analysis failed", { jdId, err }),
      );

    return NextResponse.json(
      { jobDescription: toSafeJobDescription(jobDescription) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create job description error", error);

    return NextResponse.json(
      { error: "Something went wrong while saving the job description." },
      { status: 500 },
    );
  }
}
