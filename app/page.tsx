import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import type { ReactNode } from "react";
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

const workflowSteps = [
  {
    eyebrow: "Upload",
    title: "PDF + DOCX",
    description:
      "Parse the source material and keep it cleanly structured from the very first read.",
    icon: <FileIcon />,
  },
  {
    eyebrow: "Tailor",
    title: "Job-aware AI",
    description:
      "Generate targeted resume variants and matching cover letters quickly and faithfully.",
    icon: <SparkIcon />,
  },
  {
    eyebrow: "Export",
    title: "Design-ready",
    description:
      "Choose layouts, preview live, and download a polished file you would be proud to send.",
    icon: <PaletteIcon />,
  },
];

const toolkit = [
  {
    title: "AI Analysis",
    description: "Smart feedback on your resume's strengths, gaps, and overall relevance.",
    icon: <SearchIcon />,
  },
  {
    title: "Job Matching",
    description: "Compare your resume against any job description in seconds.",
    icon: <TargetIcon />,
  },
  {
    title: "Beautiful Templates",
    description: "Designer layouts that stand out without shouting for attention.",
    icon: <BookmarkIcon />,
  },
  {
    title: "Share & Publish",
    description: "Send a live link or download a polished PDF. Your call.",
    icon: <LinkIcon />,
  },
];

export default async function Home() {
  const session = await getServerSession(authOptions);
  const canValidateGeminiKeys = isAdminEmail(session?.user?.email);
  let selectedGeminiRouterIndex = 1;
  let selectedHuggingFaceRouterIndex = 1;
  let preferredAI = DEFAULT_AI_PROVIDER;

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
      console.warn("Dashboard user settings could not be loaded.", error);
    }
  }

  const routerControl =
    session && preferredAI === "gemini" ? (
      <GeminiRouterControl
        canValidateKeys={canValidateGeminiKeys}
        initialRouters={listGeminiRouters(selectedGeminiRouterIndex)}
        initialSelectedRouterIndex={selectedGeminiRouterIndex}
      />
    ) : session && preferredAI === "huggingface" ? (
      <HuggingFaceRouterControl
        canValidateKeys={false}
        initialRouters={listHuggingFaceRouters(selectedHuggingFaceRouterIndex)}
        initialSelectedRouterIndex={selectedHuggingFaceRouterIndex}
      />
    ) : null;

  return (
    <div className="profile-compact hide-app-navbar relative pb-16">
      <div className="pointer-events-none absolute left-6 top-44 h-1.5 w-1.5 rounded-full bg-[#1b1d2a]/10 shadow-[42rem_18rem_0_0_rgba(27,29,42,0.08)]" />

      <section className="relative overflow-hidden rounded-[1.75rem] bg-[radial-gradient(60%_80%_at_95%_90%,#fbcf9d_0%,transparent_60%),radial-gradient(50%_70%_at_5%_10%,#fde2c5_0%,transparent_60%),linear-gradient(135deg,#ffd14a_0%,#f4b83c_42%,#f5a490_100%)] px-6 py-7 text-white shadow-[0_28px_70px_-48px_rgba(31,29,42,0.42)] sm:px-9 sm:py-8 lg:px-11">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-full border border-white/50 bg-white/20 py-2 pl-2 pr-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-md transition hover:bg-white/28"
          >
            <Image
              src="/applymate-icon.png"
              alt="Resume Foundry"
              width={800}
              height={800}
              priority
              className="h-10 w-10 flex-shrink-0 object-contain"
            />
            <span className="hidden leading-none sm:block">
              <span className="block font-[var(--font-kaisei-tokumin)] text-base font-extrabold tracking-[-0.03em]">
                Resume Foundry
              </span>
              <span className="mt-1 block text-[0.68rem] font-semibold text-white/82">
                career crafting studio
              </span>
            </span>
          </Link>

          <DashboardHeroActions
            isSignedIn={Boolean(session)}
            routerControl={routerControl}
          />
        </div>

        <span className="mt-12 inline-flex items-center gap-2.5 rounded-full border border-white/55 px-3.5 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-white/95">
          Vol. 01 · Welcome back
        </span>

        <div className="mt-5 grid gap-9 lg:grid-cols-[1.35fr_0.85fr] lg:items-end">
          <div>
            <h1 className="font-display text-[3.7rem] font-bold italic leading-[1.02] tracking-[-0.02em] text-white sm:text-[4.8rem]">
              Lovely resumes,
              <br />
              serious results.
              <span className="ml-3 inline-block translate-y-[-0.35rem] not-italic text-[#fff8e9]">
                ★
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-white/90">
              A workspace to upload, analyze, tailor, design, compare, and share
              polished resumes. Warm, guided, and unmistakably yours.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <DashboardButton href="/profile" tone="primary">
                Open your studio
                <ArrowUpRightIcon />
              </DashboardButton>
              <DashboardButton href="/auth/signup" tone="light">
                Start crafting
                <PlusIcon />
              </DashboardButton>
            </div>

            <p className="mt-5 font-mono text-[0.7rem] tracking-[0.04em] text-white/80">
              free to start · no credit card required
            </p>
          </div>

          <ResumePreviewCard />
        </div>
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Vol. 02 · how it works"
          title="From raw file to polished application."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {workflowSteps.map((step, index) => (
            <article
              key={step.eyebrow}
              className="relative overflow-hidden rounded-[1.375rem] border border-[#e8e1d4] bg-white p-6 shadow-[0_20px_46px_-38px_rgba(31,29,42,0.28)]"
            >
              <span className="pointer-events-none absolute right-5 top-3 font-display text-6xl font-bold leading-none tracking-[-0.04em] text-[#d8cfbd]">
                {index + 1}
              </span>
              <div
                className={[
                  "mb-5 grid h-11 w-11 place-items-center rounded-xl text-[#1b1d2a]",
                  index === 0
                    ? "bg-[#eeebf7]"
                    : index === 1
                      ? "bg-[#fde7d2]"
                      : "bg-[#d9ece1]",
                ].join(" ")}
              >
                {step.icon}
              </div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#2e6e58]">
                {step.eyebrow}
              </p>
              <h3 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.01em] text-[#1b1d2a]">
                {step.title}
              </h3>
              <p className="mt-2 max-w-[95%] text-sm leading-7 text-[#4a4d5e]">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <SectionHeading
          eyebrow="Vol. 03 · everything you need"
          title="Your full career toolkit."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {toolkit.map((tool, index) => (
            <article
              key={tool.title}
              className="rounded-[1.25rem] border border-[#e8e1d4] bg-white p-5 shadow-[0_18px_42px_-38px_rgba(31,29,42,0.24)]"
            >
              <div
                className={[
                  "mb-4 grid h-10 w-10 place-items-center rounded-[0.7rem] text-[#1b1d2a]",
                  index === 0
                    ? "bg-[#eeebf7]"
                    : index === 1
                      ? "bg-[#fde7d2]"
                      : index === 2
                        ? "bg-[#d9ece1]"
                        : "bg-[#f1ddd6]",
                ].join(" ")}
              >
                {tool.icon}
              </div>
              <h4 className="font-display text-xl font-bold tracking-[-0.01em] text-[#1b1d2a]">
                {tool.title}
              </h4>
              <p className="mt-1.5 text-sm leading-6 text-[#4a4d5e]">
                {tool.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-[1.625rem] border border-[#e8e1d4] bg-[linear-gradient(180deg,#fff_0%,#faf6ee_100%)] px-6 py-14 text-center shadow-[0_22px_54px_-44px_rgba(31,29,42,0.28)] sm:px-10">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#8a8d9c]">
          Vol. 04 · ready to begin?
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-[#1b1d2a] sm:text-5xl">
          Your dream resume starts here.
        </h2>
        <p className="mx-auto mt-4 max-w-lg leading-8 text-[#4a4d5e]">
          Join Resume Foundry and craft resumes that land interviews beautifully,
          and on your own terms.
        </p>
        <div className="mt-7 inline-flex flex-col gap-3 sm:flex-row">
          <DashboardButton href="/auth/signup" tone="primary">
            Start crafting
            <ArrowUpRightIcon />
          </DashboardButton>
          <DashboardButton href="/auth/login" tone="ghost">
            Log back in
            <PlusIcon />
          </DashboardButton>
        </div>
      </section>

      <footer className="mt-10 flex flex-col gap-2 font-mono text-[0.68rem] uppercase tracking-[0.04em] text-[#8a8d9c] sm:flex-row sm:items-center sm:justify-between">
        <span>© Resume Foundry · 2026</span>
        <span>v.04 · made with care</span>
      </footer>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="text-center">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#8a8d9c]">
        {eyebrow}
      </p>
      <h2 className="mx-auto mt-2 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-[#1b1d2a] sm:text-5xl">
        {title}
      </h2>
    </div>
  );
}

function DashboardHeroActions({
  isSignedIn,
  routerControl,
}: {
  isSignedIn: boolean;
  routerControl: ReactNode;
}) {
  if (!isSignedIn) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/auth/login"
          className="inline-flex h-[42px] items-center justify-center rounded-full border border-white/50 bg-white/18 px-4 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/30"
        >
          Log in
        </Link>
        <Link
          href="/auth/signup"
          className="inline-flex h-[42px] items-center justify-center rounded-full border border-white/60 bg-white px-4 text-sm font-bold text-[#a9672b] shadow-[0_12px_24px_-20px_rgba(46,38,64,0.34)] transition hover:bg-[#fff8e9]"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {routerControl}

      <div className="hero-nav-pill">
        <Link href="/" className="hero-nav-item" aria-current="page">
          <DashboardHeroIcon kind="dashboard" />
          <span>Dashboard</span>
        </Link>
        <Link href="/retail" className="hero-nav-item">
          <DashboardHeroIcon kind="tailor" />
          <span>Tailor</span>
        </Link>
        <Link href="/history" className="hero-nav-item">
          <DashboardHeroIcon kind="history" />
          <span>History</span>
        </Link>
      </div>

      <Link href="/profile" aria-label="Profile" className="hero-icon-button">
        <DashboardHeroIcon kind="profile" />
      </Link>

      <LogoutButton variant="hero" />
    </div>
  );
}

function DashboardButton({
  children,
  href,
  tone,
}: {
  children: ReactNode;
  href: string;
  tone: "primary" | "light" | "ghost";
}) {
  const toneClass =
    tone === "primary"
      ? "border-transparent bg-[#7fae9b] text-white hover:bg-[#6e9e8b]"
      : tone === "light"
        ? "border-white/45 bg-white/20 text-white backdrop-blur hover:bg-white/30"
        : "border-[#e8e1d4] bg-white text-[#1b1d2a] hover:bg-[#faf6ee]";

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition active:translate-y-px ${toneClass}`}
    >
      {children}
    </Link>
  );
}

function ResumePreviewCard() {
  return (
    <aside
      aria-label="Resume preview"
      className="relative justify-self-end rounded-[1.375rem] bg-white p-5 text-[#1b1d2a] shadow-[0_30px_60px_-25px_rgba(31,29,42,0.35),0_8px_20px_-10px_rgba(31,29,42,0.18)] max-lg:max-w-sm lg:w-full"
    >
      <div className="absolute -right-3.5 -top-3.5 grid h-9 w-9 place-items-center rounded-full bg-[linear-gradient(135deg,#b8a4d4,#f3d5cf)] text-sm text-white">
        ✦
      </div>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-[radial-gradient(circle_at_30%_30%,#fff,#f7c690_60%,#d76f5a)]" />
        <div className="h-2 flex-1 rounded-full bg-[#efe9dc]" />
      </div>
      <div className="my-5 grid gap-2.5">
        <div className="h-2 w-[90%] rounded-full bg-[#efe9dc]" />
        <div className="h-2 w-[55%] rounded-full bg-[#efe9dc]" />
        <div className="h-2 w-[90%] rounded-full bg-[#efe9dc]/70" />
        <div className="h-2 w-[40%] rounded-full bg-[#efe9dc]" />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {["React", "TypeScript", "Design"].map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-[#cfe3d8] px-2.5 py-1 font-mono text-[0.62rem] font-semibold text-[#2e6e58]"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#f4efe4] py-1 pl-1.5 pr-3 font-mono text-[0.68rem] text-[#4a4d5e]">
        <span className="h-3.5 w-3.5 rounded bg-[#7fae9b]" />
        AI Tailored
      </div>
    </aside>
  );
}

function DashboardHeroIcon({
  kind,
}: {
  kind: "dashboard" | "tailor" | "history" | "profile";
}) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    width: "15",
    height: "15",
    "aria-hidden": true,
  };

  if (kind === "dashboard") {
    return (
      <svg {...props}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
      </svg>
    );
  }

  if (kind === "tailor") {
    return (
      <svg {...props}>
        <path d="M5 19 17 7" />
        <path d="m14.5 4.5 5 5" />
        <path d="M19 13.5 21 16" />
        <path d="M21 13.5 19 16" />
        <circle cx="6" cy="18" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (kind === "history") {
    return (
      <svg {...props}>
        <path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8" />
        <path d="M3.8 4.6V10h5.4" />
        <path d="M12 8.4v4l2.6 1.6" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20.5a7 7 0 0 1 14 0" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l1.8 4.8L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.2z" />
      <circle cx="18" cy="17" r="1.5" />
      <circle cx="6" cy="17" r="1.5" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="9.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
      <circle cx="16" cy="9.5" r="1.2" fill="currentColor" />
      <circle cx="16.5" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 4h14v16l-7-4-7 4z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1-1" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-white/25">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M7 17 17 7" />
        <path d="M9 7h8v8" />
      </svg>
    </span>
  );
}

function PlusIcon() {
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-current">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    </span>
  );
}
