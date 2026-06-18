import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { toSafeGeneration } from "@/lib/generation";
import {
  compareGenerations,
} from "@/lib/resume-comparison";
import { connectToDatabase } from "@/lib/db";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (ids.length !== 2 || !ids.every((id) => Types.ObjectId.isValid(id))) {
    return NextResponse.json(
      { error: "Please choose exactly two valid generations to compare." },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const generations = await Generation.find({
    _id: { $in: ids },
    userId: session.user.id,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (generations.length !== 2) {
    return NextResponse.json(
      { error: "One or both generations were not found." },
      { status: 404 },
    );
  }

  const resumeIds = [
    ...new Set(generations.map((generation) => generation.sourceResumeId.toString())),
  ];
  const jobDescriptionIds = [
    ...new Set(
      generations
        .map((generation) => generation.jobDescriptionId?.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [resumes, jobDescriptions] = await Promise.all([
    Resume.find({ _id: { $in: resumeIds } }).select("fileName").lean(),
    jobDescriptionIds.length
      ? JobDescription.find({ _id: { $in: jobDescriptionIds } })
          .select("title company")
          .lean()
      : Promise.resolve([]),
  ]);
  const resumeMap = new Map(
    resumes.map((resume) => [
      resume._id.toString(),
      {
        id: resume._id.toString(),
        fileName: resume.fileName,
      },
    ]),
  );
  const jobDescriptionMap = new Map(
    jobDescriptions.map((jobDescription) => [
      jobDescription._id.toString(),
      {
        id: jobDescription._id.toString(),
        title: jobDescription.title ?? "",
        company: jobDescription.company ?? "",
      },
    ]),
  );
  const safeGenerations = generations.map((generation) =>
    toSafeGeneration(generation, {
      sourceResume: resumeMap.get(generation.sourceResumeId.toString()) ?? null,
      jobDescription: generation.jobDescriptionId
        ? jobDescriptionMap.get(generation.jobDescriptionId.toString()) ?? null
        : null,
    }),
  );
  const comparison = compareGenerations(safeGenerations[0], safeGenerations[1]);

  return NextResponse.json({
    generations: safeGenerations,
    comparison,
  });
}
