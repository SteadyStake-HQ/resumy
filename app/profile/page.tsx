import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBlockingOverlay } from "@/components/app-blocking-overlay";
import {
  GeminiRouterControl,
  HuggingFaceRouterControl,
} from "@/components/gemini-router-control";
import { PageHero } from "@/components/page-hero";
import { ProfileForm } from "@/components/profile-form";
import { ProfileHeroMascot } from "@/components/profile/profile-hero-mascot";
import { ResumeManager } from "@/components/resume-manager";
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
import { connectToDatabase } from "@/lib/db";
import { toSafeResume } from "@/lib/resume";
import { toSafeUser } from "@/lib/user";
import Resume from "@/models/Resume";
import User from "@/models/User";

function isDatabaseConnectionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Prisma|Postgres|Neon|DATABASE_URL|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|getaddrinfo|server selection|database/i.test(
    `${error.name} ${error.message}`,
  );
}

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  let user;
  let resumes;

  try {
    await connectToDatabase();

    [user, resumes] = await Promise.all([
      User.findById(session.user.id).lean(),
      Resume.find({ userId: session.user.id }).sort({ createdAt: -1 }).lean(),
    ]);
  } catch (error) {
    if (!isDatabaseConnectionError(error)) {
      throw error;
    }

    console.warn("Profile data could not be loaded due to database connection issue:", error);

    return (
      <AppBlockingOverlay
        tone="error"
        eyebrow="Database connection"
        title="Reconnecting to database"
        message="The app cannot reach Neon Postgres right now. This is usually a temporary DNS or network issue, so the profile screen is locked until the database responds."
        detail="Refresh this page after your network, DNS, or database connection recovers."
      />
    );
  }

  if (!user) {
    redirect("/auth/login");
  }

  const safeUser = toSafeUser(user);
  const canValidateGeminiKeys = isAdminEmail(session.user.email);
  const preferredAI = normalizeAIProvider(
    user?.settings?.preferredAI ?? safeUser.settings.preferredAI,
  );
  const selectedGeminiRouterIndex = normalizeGeminiRouterIndex(
    user?.settings?.preferredGeminiRouterIndex,
  );
  const selectedHuggingFaceRouterIndex = normalizeHuggingFaceRouterIndex(
    user?.settings?.preferredHuggingFaceRouterIndex,
  );

  const geminiRouters = listGeminiRouters(selectedGeminiRouterIndex);
  const huggingFaceRouters = listHuggingFaceRouters(selectedHuggingFaceRouterIndex);

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
    <PageHero
      volumeLabel="Vol. 04 · your profile"
      title={`hi, ${safeUser.nickname || "friend"} ★`}
      subtitle="a little homepage for you and Buni. settings, membership, and the resumes your tiny helper is polishing for you."
      routerControl={routerControl}
      mascot={<ProfileHeroMascot />}
      activeNavItem="profile"
    >
      <ProfileForm
        email={safeUser.email}
        nickname={safeUser.nickname}
        membership={safeUser.membership}
        preferredAI={safeUser.settings.preferredAI}
      />
      <ResumeManager
        initialResumes={resumes.map((resume) => toSafeResume(resume))}
      />
    </PageHero>
  );
}
