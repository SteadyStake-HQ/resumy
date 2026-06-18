import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BuniMascot } from "@/components/profile/buni-mascot";

type AuthShellProps = {
  children: ReactNode;
  /** Controls the hero heading — defaults to "welcome back" for login */
  mode?: "login" | "signup";
};

export function AuthShell({ children, mode = "login" }: AuthShellProps) {
  const isSignup = mode === "signup";
  const title = isSignup ? "join the studio ✦" : "welcome back ✦";
  const subtitle = isSignup
    ? "create your account and start crafting."
    : "your crafting studio is ready and waiting.";
  const volumeLabel = isSignup ? "Vol. 00 · create account" : "Vol. 00 · sign in";

  return (
    <div
      style={{
        margin: "0 auto",
        maxWidth: 480,
        paddingTop: 32,
        paddingBottom: 48,
      }}
    >
      {/* Branded hero card */}
      <div
        style={{
          overflow: "hidden",
          borderRadius: 28,
          border: "1.5px solid #E9D9B8",
          background: "#FFF9EC",
          boxShadow: "0 30px 80px -30px rgba(184,155,232,0.3)",
        }}
      >
        {/* Gradient header */}
        <div
          style={{
            position: "relative",
            padding: "28px 36px 32px",
            background: "linear-gradient(135deg, #FFD14A, #F4B83C 50%, #F5A490)",
            overflow: "hidden",
          }}
        >
          {/* Sparkle dots */}
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
          {/* Star accent */}
          <svg
            style={{ position: "absolute", top: 24, right: 48, pointerEvents: "none" }}
            width="20"
            height="20"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"
              fill="#fff"
              opacity="0.8"
            />
          </svg>

          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            {/* Brand mark */}
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                textDecoration: "none",
              }}
            >
              <Image
                src="/applymate-icon.png"
                alt="Resume Foundry"
                width={800}
                height={800}
                priority
                style={{
                  width: 38,
                  height: 38,
                  flexShrink: 0,
                  objectFit: "contain",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.3)",
                  border: "1.5px solid rgba(255,255,255,0.6)",
                  padding: 4,
                }}
              />
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-kaisei-tokumin), serif",
                    fontSize: "0.95rem",
                    fontWeight: 800,
                    color: "#fff",
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Resume Foundry
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-ibm-plex-mono), monospace",
                    fontSize: "0.62rem",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.82)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginTop: 2,
                  }}
                >
                  career crafting studio
                </div>
              </div>
            </Link>

            {/* Mascot */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.35)",
                border: "2px solid rgba(255,255,255,0.6)",
                display: "grid",
                placeItems: "center",
                backdropFilter: "blur(8px)",
                flexShrink: 0,
              }}
            >
              <BuniMascot size={60} mood={isSignup ? "wave" : "happy"} />
            </div>
          </div>

          {/* Vol label */}
          <div
            style={{
              marginTop: 22,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.22)",
              border: "1.5px solid rgba(255,255,255,0.45)",
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "1.8px",
              textTransform: "uppercase",
              color: "#fff",
            }}
          >
            {volumeLabel}
          </div>

          {/* Title */}
          <div
            style={{
              marginTop: 12,
              fontFamily: "var(--font-kaisei-tokumin), serif",
              fontSize: "clamp(1.8rem, 5vw, 2.4rem)",
              fontWeight: 800,
              letterSpacing: "-0.06em",
              color: "#fff",
              lineHeight: 1.05,
              textShadow: "0 2px 20px rgba(46,38,64,0.15)",
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Form area */}
        <div style={{ padding: "32px 36px 36px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
