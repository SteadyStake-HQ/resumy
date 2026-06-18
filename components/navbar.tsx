import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  GeminiRouterControl,
  HuggingFaceRouterControl,
} from "@/components/gemini-router-control";
import { LogoutButton } from "@/components/logout-button";
import { isAdminEmail } from "@/lib/admin";
import { DEFAULT_AI_PROVIDER, normalizeAIProvider } from "@/lib/ai-provider";
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
import User from "@/models/User";

type NavIconName =
  | "dashboard"
  | "profile"
  | "retail"
  | "history"
  | "login"
  | "signup";

function NavIcon({ name }: { name: NavIconName }) {
  const p = {
    className: "nav-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "dashboard":
      // 2x2 rounded grid — clear, universal "overview" affordance.
      return (
        <svg {...p}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
        </svg>
      );
    case "profile":
      // Softer rounded bust — slightly heavier shoulder line for warmth.
      return (
        <svg {...p}>
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M5 20.5a7 7 0 0 1 14 0" />
        </svg>
      );
    case "retail":
      // Tailor → needle + sparkle. Reads as "AI tailoring" rather than "send".
      return (
        <svg {...p}>
          <path d="M5 19 17 7" />
          <path d="m14.5 4.5 5 5" />
          <path d="M19 13.5 21 16" />
          <path d="M21 13.5 19 16" />
          <circle cx="6" cy="18" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "history":
      // Counter-clockwise arrow + clock hands — kept (it's the right metaphor)
      // but tightened the path so it reads as a single confident gesture.
      return (
        <svg {...p}>
          <path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8" />
          <path d="M3.8 4.6V10h5.4" />
          <path d="M12 8.4v4l2.6 1.6" />
        </svg>
      );
    case "login":
      return (
        <svg {...p}>
          <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
          <path d="M4 12h10" />
          <path d="m10 8 4 4-4 4" />
        </svg>
      );
    case "signup":
      return (
        <svg {...p}>
          <path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M3.5 20a6 6 0 0 1 12 0" />
          <path d="M18 8v6" />
          <path d="M15 11h6" />
        </svg>
      );
  }
}

export async function Navbar() {
  const session = await getServerSession(authOptions);
  const canValidateGeminiKeys = isAdminEmail(session?.user?.email);
  let selectedGeminiRouterIndex = 1;
  let selectedHuggingFaceRouterIndex = 1;
  let preferredAI = DEFAULT_AI_PROVIDER;
  let geminiRouters = session ? listGeminiRouters(selectedGeminiRouterIndex) : [];
  let huggingFaceRouters = session
    ? listHuggingFaceRouters(selectedHuggingFaceRouterIndex)
    : [];

  if (session?.user?.id) {
    try {
      await connectToDatabase();
      const user = await User.findById(session.user.id)
        .select("settings")
        .lean();

      preferredAI = normalizeAIProvider(user?.settings?.preferredAI);
      selectedGeminiRouterIndex = normalizeGeminiRouterIndex(
        user?.settings?.preferredGeminiRouterIndex,
      );
      selectedHuggingFaceRouterIndex = normalizeHuggingFaceRouterIndex(
        user?.settings?.preferredHuggingFaceRouterIndex,
      );
    } catch (error) {
      console.warn("Navbar user settings could not be loaded.", error);
      if (preferredAI === "gemini") {
        geminiRouters = listGeminiRouters(selectedGeminiRouterIndex);
      } else if (preferredAI === "huggingface") {
        huggingFaceRouters = listHuggingFaceRouters(
          selectedHuggingFaceRouterIndex,
        );
      }
    }
  }

  return (
    <header data-app-navbar="true" className="sticky top-4 z-40 py-4">
      <nav
        className="flex items-center justify-between gap-3 rounded-[2rem] px-5 py-3 sm:px-7"
        style={{
          background: "rgba(255,255,255,0.78)",
          border: "1.5px solid rgba(233,217,184,0.88)",
          boxShadow: "0 20px 50px -32px rgba(184,155,232,0.35)",
          backdropFilter: "blur(14px)",
        }}
      >
        {/* Brand */}
        <Link
          href="/"
          className="inline-flex items-center gap-3 rounded-2xl px-1 py-1 transition-opacity hover:opacity-80"
        >
          <Image
            src="/applymate-icon.png"
            alt="Resume Foundry"
            width={800}
            height={800}
            priority
            className="h-[44px] w-[44px] flex-shrink-0 object-contain"
          />
          <div className="hidden sm:block">
            <p
              style={{
                fontSize: 18,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.04em",
                color: "#56627D",
                fontFamily: 'var(--font-kaisei-tokumin), serif',
              }}
            >
              Resume Foundry
            </p>
            <p
              style={{
                marginTop: 2,
                fontSize: 11.5,
                fontWeight: 600,
                color: "#6E7489",
                lineHeight: 1,
              }}
            >
              career crafting studio
            </p>
          </div>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-2.5">
          {session && preferredAI === "gemini" ? (
            <GeminiRouterControl
              canValidateKeys={canValidateGeminiKeys}
              initialRouters={geminiRouters}
              initialSelectedRouterIndex={selectedGeminiRouterIndex}
            />
          ) : null}

          {session && preferredAI === "huggingface" ? (
            <HuggingFaceRouterControl
              canValidateKeys={false}
              initialRouters={huggingFaceRouters}
              initialSelectedRouterIndex={selectedHuggingFaceRouterIndex}
            />
          ) : null}

          {session ? (
            <>
              <div className="primary-nav-pill hidden sm:inline-flex">
                <Link
                  href="/"
                  className="primary-nav-item"
                  data-tone="dashboard"
                >
                  <NavIcon name="dashboard" />
                  <span>Dashboard</span>
                </Link>
                <Link
                  href="/retail"
                  className="primary-nav-item"
                  data-tone="tailor"
                >
                  <NavIcon name="retail" />
                  <span>Tailor</span>
                </Link>
                <Link
                  href="/history"
                  className="primary-nav-item"
                  data-tone="history"
                >
                  <NavIcon name="history" />
                  <span>History</span>
                </Link>
              </div>

              <div className="flex items-center gap-1.5">
                <Link
                  href="/profile"
                  aria-label="Profile"
                  className="profile-icon-button"
                >
                  <NavIcon name="profile" />
                </Link>
                <LogoutButton />
              </div>
            </>
          ) : (
            <div className="auth-button-group" aria-label="Account actions">
              <Link href="/auth/login" className="nav-icon-link button-ghost">
                <span>Log In</span>
                <NavIcon name="login" />
              </Link>
              <Link
                href="/auth/signup"
                className="nav-icon-link button-primary"
              >
                <span>Sign Up</span>
                <NavIcon name="signup" />
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
