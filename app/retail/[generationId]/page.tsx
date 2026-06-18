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
import { toSafeGeneration } from "@/lib/generation";
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
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";
import User from "@/models/User";

type RetailGenerationPageProps = {
  params: Promise<{
    generationId?: string;
  }>;
  searchParams: Promise<{
    modal?: string | string[];
  }>;
};

export default async function RetailGenerationPage({
  params,
  searchParams,
}: RetailGenerationPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const { generationId } = await params;
  const resolvedSearchParams = await searchParams;
  const modal = Array.isArray(resolvedSearchParams.modal)
    ? resolvedSearchParams.modal[0]
    : resolvedSearchParams.modal;

  if (!generationId || !/^[0-9a-fA-F]{24}$/.test(generationId)) {
    redirect("/retail");
  }

  await connectToDatabase();

  const [resumes, jobDescriptions, user, generation, activeTemplates] = await Promise.all([
    Resume.find({ userId: session.user.id }).sort({ createdAt: -1 }).lean(),
    JobDescription.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .lean(),
    User.findById(session.user.id).lean(),
    Generation.findOne({ _id: generationId, userId: session.user.id }).lean(),
    listActiveDesignTemplates(),
  ]);

  if (!user) {
    redirect("/auth/login");
  }

  if (!generation) {
    redirect("/retail");
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
          initialResumeId={generation.sourceResumeId.toString()}
          initialGeneration={toSafeGeneration(generation)}
          initialTemplate={activeTemplates[0] ?? null}
          initialOpenDownloadModal={modal === "download"}
          membershipTier={user.membership?.tier ?? "free"}
        />
      </PageHero>
    </div>
  );
}
