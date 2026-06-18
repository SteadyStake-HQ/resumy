import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { GenerationComparison } from "@/components/generation-comparison";
import { PageHero } from "@/components/page-hero";
import { CompareHeroMascot } from "@/components/profile/compare-hero-mascot";
import { authOptions } from "@/lib/auth";
import { toSafeGeneration } from "@/lib/generation";
import { hasPremiumAccess } from "@/lib/membership";
import { connectToDatabase } from "@/lib/db";
import { compareGenerations } from "@/lib/resume-comparison";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";
import User from "@/models/User";

type ComparePageProps = {
  searchParams: Promise<{
    ids?: string | string[];
  }>;
};

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const resolvedSearchParams = await searchParams;
  const rawIds = Array.isArray(resolvedSearchParams.ids)
    ? resolvedSearchParams.ids[0]
    : resolvedSearchParams.ids;
  const ids = (rawIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 2);

  await connectToDatabase();

  const user = await User.findById(session.user.id).lean();

  if (!user) {
    redirect("/auth/login");
  }

  if (!hasPremiumAccess(user.membership?.tier)) {
    return (
      <PageHero
        volumeLabel="Vol. 07 · compare"
        title="compare ⚖"
        subtitle="see exactly what changed between two tailored versions."
        activeNavItem="history"
        mascot={<CompareHeroMascot />}
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
            ⚖
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
            Premium Feature
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
            Resume comparison is a premium feature
          </h2>
          <p style={{ color: "#6B5E4A", fontSize: 14, lineHeight: 1.7, maxWidth: 380, margin: 0 }}>
            Upgrade your membership to compare two tailored generations side by side and spot every difference.
          </p>
          <Link
            href="/membership"
            className="button-primary soft-ring"
            style={{ marginTop: 8, padding: "10px 28px" }}
          >
            Open Membership
          </Link>
        </div>
      </PageHero>
    );
  }

  if (ids.length !== 2) {
    return (
      <PageHero
        volumeLabel="Vol. 07 · compare"
        title="compare ⚖"
        subtitle="see exactly what changed between two tailored versions."
        activeNavItem="history"
        mascot={<CompareHeroMascot />}
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
            Nothing selected
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
            Choose two generations to compare
          </h2>
          <p style={{ color: "#6B5E4A", fontSize: 14, lineHeight: 1.7, maxWidth: 380, margin: 0 }}>
            Select exactly two generations on the history page, then open compare again.
          </p>
          <Link
            href="/history"
            className="button-primary soft-ring"
            style={{ marginTop: 8, padding: "10px 28px" }}
          >
            Go to History
          </Link>
        </div>
      </PageHero>
    );
  }

  const generations = await Generation.find({
    _id: { $in: ids },
    userId: session.user.id,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (generations.length !== 2) {
    redirect("/history");
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

  return (
    <PageHero
      volumeLabel="Vol. 07 · compare"
      title="compare ⚖"
      subtitle="see exactly what changed between two tailored versions."
      activeNavItem="history"
      mascot={<CompareHeroMascot />}
    >
      <GenerationComparison
        leftGeneration={safeGenerations[0]}
        rightGeneration={safeGenerations[1]}
        comparison={compareGenerations(safeGenerations[0], safeGenerations[1])}
      />
    </PageHero>
  );
}
