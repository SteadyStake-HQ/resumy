import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { toSafeDesignTemplate } from "@/lib/design-template";
import { toDesignTemplateSummary, toSafeGeneration } from "@/lib/generation";
import { connectToDatabase } from "@/lib/db";
import DesignTemplate from "@/models/DesignTemplate";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectToDatabase();

  const generations = await Generation.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .lean();

  const resumeIds = [...new Set(generations.map((generation) => generation.sourceResumeId.toString()))];
  const jobDescriptionIds = [
    ...new Set(
      generations
        .map((generation) => generation.jobDescriptionId?.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const templateIds = [
    ...new Set(
      generations
        .map((generation) => generation.designTemplateId?.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [resumes, jobDescriptions, designTemplates] = await Promise.all([
    resumeIds.length
      ? Resume.find({ _id: { $in: resumeIds } }).select("fileName").lean()
      : Promise.resolve([]),
    jobDescriptionIds.length
      ? JobDescription.find({ _id: { $in: jobDescriptionIds } })
          .select("title company")
          .lean()
      : Promise.resolve([]),
    templateIds.length
      ? DesignTemplate.find({ _id: { $in: templateIds } })
          .select("slug name thumbnailUrl category engine")
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
  const designTemplateMap = new Map(
    designTemplates.map((template) => [
      template._id.toString(),
      toDesignTemplateSummary(toSafeDesignTemplate(template)),
    ]),
  );

  return NextResponse.json({
    generations: generations.map((generation) =>
      toSafeGeneration(generation, {
        sourceResume:
          resumeMap.get(generation.sourceResumeId.toString()) ?? null,
        jobDescription: generation.jobDescriptionId
          ? jobDescriptionMap.get(generation.jobDescriptionId.toString()) ?? null
          : null,
        designTemplate: generation.designTemplateId
          ? designTemplateMap.get(generation.designTemplateId.toString()) ?? null
          : null,
      }),
    ),
  });
}
