import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  GeminiRouterControl,
  HuggingFaceRouterControl,
} from "@/components/gemini-router-control";
import { PageHero } from "@/components/page-hero";
import { TailorHeroMascot } from "@/components/profile/tailor-hero-mascot";
import { RetailWorkspace } from "@/components/retail-workspace";
import { isAdminEmail } from "@/lib/admin";
import { normalizeAIProvider } from "@/lib/ai-provider";
import { authOptions } from "@/lib/auth";
import {
  listGeminiRouters,
  normalizeGeminiRouterIndex,
} from "@/lib/gemini-router";
import {
  listHuggingFaceRouters,
  normalizeHuggingFaceRouterIndex,
} from "@/lib/huggingface-router";
import { toSafeJobDescription } from "@/lib/job-description";
import { connectToDatabase } from "@/lib/db";
import { type ResumeSummary, toSafeResume } from "@/lib/resume";
import { listActiveDesignTemplates } from "@/lib/templates";
import { toSafeUser } from "@/lib/user";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";
import User from "@/models/User";

type RetailPageProps = {
  searchParams: Promise<{
    resumeId?: string | string[];
  }>;
};

export default async function RetailPage({ searchParams }: RetailPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const resolvedSearchParams = await searchParams;
  const initialResumeId = Array.isArray(resolvedSearchParams.resumeId)
    ? resolvedSearchParams.resumeId[0]
    : resolvedSearchParams.resumeId;

  await connectToDatabase();

  const [resumes, jobDescriptions, user, activeTemplates] = await Promise.all([
    Resume.find({ userId: session.user.id }).sort({ createdAt: -1 }).lean(),
    JobDescription.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .lean(),
    User.findById(session.user.id).lean(),
    listActiveDesignTemplates(),
  ]);

  if (!user) {
    redirect("/auth/login");
  }

  const safeUser = toSafeUser(user);
  const canValidateGeminiKeys = isAdminEmail(session.user.email);
  const preferredAI = normalizeAIProvider(
    user.settings?.preferredAI ?? safeUser.settings.preferredAI,
  );
  const selectedGeminiRouterIndex = normalizeGeminiRouterIndex(
    user.settings?.preferredGeminiRouterIndex,
  );
  const selectedHuggingFaceRouterIndex = normalizeHuggingFaceRouterIndex(
    user.settings?.preferredHuggingFaceRouterIndex,
  );

  const geminiRouters = listGeminiRouters(selectedGeminiRouterIndex);
  const huggingFaceRouters = listHuggingFaceRouters(selectedHuggingFaceRouterIndex);

  const resumeSummaries: ResumeSummary[] = resumes.map((resume) => {
    const safeResume = toSafeResume(resume);

    return {
      id: safeResume.id,
      fileName: safeResume.fileName,
      createdAt: safeResume.createdAt,
    };
  });

  const routerControl =
    preferredAI === "gemini" ? (
      <GeminiRouterControl
        canValidateKeys={canValidateGeminiKeys}
        initialRouters={geminiRouters}
        initialSelectedRouterIndex={selectedGeminiRouterIndex}
      />
    ) : preferredAI === "huggingface" ? (
      <HuggingFaceRouterControl
        canValidateKeys={false}
        initialRouters={huggingFaceRouters}
        initialSelectedRouterIndex={selectedHuggingFaceRouterIndex}
      />
    ) : null;

  return (
    <div className="hide-app-navbar">
      <PageHero
        volumeLabel="Vol. 05 · tailor mode"
        title="ready to tailor ✂︎"
        subtitle="pick your strongest base resume, drop in the job description, and Buni will reshape it to fit the role — saved straight into your history."
        routerControl={routerControl}
        mascot={<TailorHeroMascot />}
        activeNavItem="tailor"
      >
        <RetailWorkspace
          resumes={resumeSummaries}
          jobDescriptions={jobDescriptions.map((jobDescription) =>
            toSafeJobDescription(jobDescription),
          )}
          initialResumeId={initialResumeId}
          initialTemplate={activeTemplates[0] ?? null}
          membershipTier={user.membership?.tier ?? "free"}
        />
      </PageHero>
    </div>
  );
}
