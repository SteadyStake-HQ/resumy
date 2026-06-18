import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { DesignStudio } from "@/components/design-studio";
import { PageHero } from "@/components/page-hero";
import { DesignHeroMascot } from "@/components/profile/design-hero-mascot";
import { authOptions } from "@/lib/auth";
import { toSafeDesignTemplate } from "@/lib/design-template";
import {
  toDesignTemplateSummary,
  toSafeGeneration,
} from "@/lib/generation";
import { connectToDatabase } from "@/lib/db";
import { listActiveDesignTemplates } from "@/lib/templates";
import DesignTemplate from "@/models/DesignTemplate";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

type DesignPageProps = {
  searchParams: Promise<{
    generationId?: string | string[];
  }>;
};

export default async function DesignPage({ searchParams }: DesignPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const resolvedSearchParams = await searchParams;
  const requestedGenerationId = Array.isArray(resolvedSearchParams.generationId)
    ? resolvedSearchParams.generationId[0]
    : resolvedSearchParams.generationId;
  const safeGenerationId =
    requestedGenerationId && /^[0-9a-fA-F]{24}$/.test(requestedGenerationId)
      ? requestedGenerationId
      : undefined;

  await connectToDatabase();

  const generation = safeGenerationId
    ? await Generation.findOne({
        _id: safeGenerationId,
        userId: session.user.id,
      }).lean()
    : await Generation.findOne({ userId: session.user.id })
        .sort({ createdAt: -1 })
        .lean();

  if (!generation) {
    return (
      <PageHero
        volumeLabel="Vol. 06 · design studio"
        title="design studio ✦"
        subtitle="pick a template, preview it live, and export a polished file."
        mascot={<DesignHeroMascot />}
      >
        <div
          style={{
            padding: "48px 40px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #FFD14A, #F5A490)",
              display: "grid",
              placeItems: "center",
              fontSize: 22,
            }}
          >
            ✦
          </div>
          <p
            style={{
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#C98F18",
            }}
          >
            No generations yet
          </p>
          <h2
            style={{
              fontFamily: "var(--font-kaisei-tokumin), serif",
              fontSize: "1.75rem",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: "#2F2A1F",
              margin: 0,
            }}
          >
            Tailor a resume before opening the design studio
          </h2>
          <p style={{ color: "#6B5E4A", fontSize: 14, lineHeight: 1.7, maxWidth: 400, margin: 0 }}>
            The design step starts from a saved generation. Create a tailored resume first,
            then come back here to preview templates and export files.
          </p>
          <Link
            href="/retail"
            className="button-primary soft-ring"
            style={{ marginTop: 8, padding: "10px 28px" }}
          >
            Open Tailor
          </Link>
        </div>
      </PageHero>
    );
  }

  const [sourceResume, jobDescription, activeTemplates, appliedTemplate] =
    await Promise.all([
      Resume.findById(generation.sourceResumeId).select("fileName").lean(),
      generation.jobDescriptionId
        ? JobDescription.findById(generation.jobDescriptionId)
            .select("title company")
            .lean()
        : Promise.resolve(null),
      listActiveDesignTemplates(),
      generation.designTemplateId
        ? DesignTemplate.findById(generation.designTemplateId)
            .select("slug name thumbnailUrl category engine")
            .lean()
        : Promise.resolve(null),
    ]);

  return (
    <PageHero
      volumeLabel="Vol. 06 · design studio"
      title="design studio ✦"
      subtitle="pick a template, preview it live, and export a polished file."
      mascot={<DesignHeroMascot />}
    >
      {(() => {
        const safeGen = toSafeGeneration(generation, {
          sourceResume: sourceResume
            ? { id: sourceResume._id.toString(), fileName: sourceResume.fileName }
            : null,
          jobDescription: jobDescription
            ? { id: jobDescription._id.toString(), title: jobDescription.title ?? "", company: jobDescription.company ?? "" }
            : null,
          designTemplate: appliedTemplate
            ? toDesignTemplateSummary(toSafeDesignTemplate(appliedTemplate))
            : null,
        });
        return (
          <DesignStudio generation={safeGen} templates={activeTemplates} />
        );
      })()}
    </PageHero>
  );
}
