import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { GenerationHistory } from "@/components/generation-history";
import { PageHero } from "@/components/page-hero";
import { HistoryHeroMascot } from "@/components/profile/history-hero-mascot";
import { authOptions } from "@/lib/auth";
import { toDesignTemplateSummary, toSafeGeneration } from "@/lib/generation";
import { connectToDatabase } from "@/lib/db";
import { toSafeDesignTemplate } from "@/lib/design-template";
import DesignTemplate from "@/models/DesignTemplate";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";
import User from "@/models/User";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  await connectToDatabase();

  const [user, generations] = await Promise.all([
    User.findById(session.user.id).select("membership").lean(),
    Generation.find({ userId: session.user.id }).sort({ createdAt: -1 }).lean(),
  ]);

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

  return (
    <PageHero
      volumeLabel="Vol. 03 · history"
      title="your history ✦"
      subtitle="every tailored resume, right where you left it."
      activeNavItem="history"
      mascot={<HistoryHeroMascot />}
    >
      <GenerationHistory
        membershipTier={user?.membership?.tier ?? "free"}
        generations={generations.map((generation) =>
          toSafeGeneration(generation, {
            sourceResume:
              resumeMap.get(generation.sourceResumeId.toString()) ?? null,
            jobDescription: generation.jobDescriptionId
              ? jobDescriptionMap.get(generation.jobDescriptionId.toString()) ??
                null
              : null,
            designTemplate: generation.designTemplateId
              ? designTemplateMap.get(generation.designTemplateId.toString()) ??
                null
              : null,
          }),
        )}
      />
    </PageHero>
  );
}
