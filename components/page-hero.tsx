import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";

type ActiveNavItem = "dashboard" | "tailor" | "history" | "profile";

type HeroIconKind = "dashboard" | "tailor" | "history" | "profile";

function HeroIcon({ kind }: { kind: HeroIconKind }) {
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

export type PageHeroProps = {
  /** Small monospaced badge above everything, e.g. "Vol. 05 · tailor mode" */
  volumeLabel: string;
  /** Big serif title, e.g. "hi, friend ★" */
  title: string;
  /** Subtitle paragraph below the title */
  subtitle: string;
  /** Optional Gemini/HuggingFace router control rendered into the action row */
  routerControl?: ReactNode;
  /** Optional mascot (typically a client component with a click-to-bubble) */
  mascot?: ReactNode;
  /** Marks the active nav item so we can subtly highlight it */
  activeNavItem?: ActiveNavItem;
  /** Body content that lives below the hero, inside the same cream card */
  children?: ReactNode;
};

/**
 * Reusable warm-gradient hero used at the top of major app pages
 * (profile, tailor, ...). Renders a cream rounded card with a sparkly
 * yellow→coral gradient hero and the standard nav pill on top.
 */
export function PageHero({
  volumeLabel,
  title,
  subtitle,
  routerControl,
  mascot,
  activeNavItem,
  children,
}: PageHeroProps) {
  return (
    <section className="profile-compact py-3" style={{ color: "#2F2A1F" }}>
      <div
        style={{
          margin: "0 auto",
          overflow: "hidden",
          borderRadius: 28,
          border: "1.5px solid #E9D9B8",
          background: "#FFF9EC",
          boxShadow: "0 30px 80px -30px rgba(184,155,232,0.3)",
        }}
      >
        <div
          style={{
            position: "relative",
            padding: "34px 40px 36px",
            background: "linear-gradient(135deg, #FFD14A, #F4B83C 50%, #F5A490)",
            overflow: "hidden",
          }}
        >
          <svg
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.55,
              pointerEvents: "none",
            }}
            width="100%"
            height="100%"
          >
            <circle cx="15%" cy="30%" r="1.5" fill="#fff" />
            <circle cx="85%" cy="20%" r="2" fill="#fff" />
            <circle cx="45%" cy="70%" r="1.2" fill="#fff" />
            <circle cx="70%" cy="55%" r="1.8" fill="#fff" />
            <circle cx="25%" cy="80%" r="1" fill="#fff" />
          </svg>
          <svg
            style={{ position: "absolute", top: 30, left: 80, pointerEvents: "none" }}
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"
              fill="#fff"
              opacity="0.8"
            />
          </svg>
          <svg
            style={{
              position: "absolute",
              bottom: 30,
              right: 120,
              pointerEvents: "none",
            }}
            width="18"
            height="18"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"
              fill="#fff"
              opacity="0.9"
            />
          </svg>

          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 26,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.25)",
                  border: "1.5px solid rgba(255,255,255,0.5)",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  color: "#fff",
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  backdropFilter: "blur(6px)",
                }}
              >
                {volumeLabel}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {routerControl}

                <div className="hero-nav-pill">
                  <Link
                    href="/"
                    className="hero-nav-item"
                    aria-current={activeNavItem === "dashboard" ? "page" : undefined}
                  >
                    <HeroIcon kind="dashboard" />
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    href="/retail"
                    className="hero-nav-item"
                    aria-current={activeNavItem === "tailor" ? "page" : undefined}
                  >
                    <HeroIcon kind="tailor" />
                    <span>Tailor</span>
                  </Link>
                  <Link
                    href="/history"
                    className="hero-nav-item"
                    aria-current={activeNavItem === "history" ? "page" : undefined}
                  >
                    <HeroIcon kind="history" />
                    <span>History</span>
                  </Link>
                </div>

                <Link
                  href="/profile"
                  aria-label="Profile"
                  className="hero-icon-button"
                  aria-current={activeNavItem === "profile" ? "page" : undefined}
                >
                  <HeroIcon kind="profile" />
                </Link>

                <LogoutButton variant="hero" />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "clamp(2.7rem,6vw,3.8rem)",
                    fontWeight: 800,
                    letterSpacing: "-0.06em",
                    color: "#fff",
                    lineHeight: 1,
                    fontFamily: "var(--font-kaisei-tokumin), serif",
                    textShadow: "0 2px 20px rgba(46,38,64,0.15)",
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    maxWidth: 540,
                    fontSize: 15,
                    lineHeight: 1.5,
                    color: "rgba(255,255,255,0.9)",
                  }}
                >
                  {subtitle}
                </div>
              </div>
              {mascot ? <div style={{ flexShrink: 0 }}>{mascot}</div> : null}
            </div>
          </div>
        </div>

        {children ? <div className="space-y-0">{children}</div> : null}
      </div>
    </section>
  );
}

/* Marker style inside .hero-nav-pill for the active page — ties into globals.css */
