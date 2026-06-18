"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AI_PROVIDER_OPTIONS } from "@/lib/ai-provider";
import { useToast } from "@/components/ui/toast-provider";
import { FancySelect } from "@/components/ui/fancy-select";
import { BuniMascot } from "@/components/profile/buni-mascot";
import { PROFILE_THEME as PROF } from "@/lib/profile-theme";

type ProfileFormProps = {
  email: string;
  nickname: string;
  membership: {
    tier: string;
    status: string;
    requestStatus: string;
    expiresAt: string | null;
  };
  preferredAI: string;
};

type ProfileResponse = {
  error?: string;
  user?: {
    nickname: string;
    membership: {
      tier: string;
      status: string;
      requestStatus: string;
      expiresAt: string | null;
    };
    settings: {
      preferredAI: string;
    };
  };
};

const expiryFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function Label({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: color || PROF.inkSoft,
        fontFamily: 'var(--font-ibm-plex-mono), monospace',
      }}
    >
      {children}
    </div>
  );
}

function PillButton({
  children,
  href,
  tone = "ghost",
}: {
  children: React.ReactNode;
  href: string;
  tone?: "ghost" | "dark";
}) {
  const styles =
    tone === "dark"
      ? {
          background: PROF.deepSoft,
          color: "#fff",
          border: "1.5px solid rgba(255,255,255,0.12)",
        }
      : {
          background: PROF.surface,
          color: PROF.ink,
          border: `1.5px solid ${PROF.line}`,
        };

  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "inherit",
        textDecoration: "none",
        ...styles,
      }}
    >
      {children}
    </Link>
  );
}

export function ProfileForm({
  email,
  nickname: initialNickname,
  membership,
  preferredAI: initialPreferredAI,
}: ProfileFormProps) {
  const router = useRouter();
  const { showErrorToast } = useToast();

  const [nickname, setNickname] = useState(initialNickname);
  const [preferredAI, setPreferredAI] = useState(initialPreferredAI);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  const isPremium = membership.tier === "premium";

  const handleSubmit = async (formData: FormData) => {
    setIsPending(true);
    setStatusMessage("");

    try {
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: formData.get("nickname"),
          preferredAI: formData.get("preferredAI"),
        }),
      });

      const payload = (await response.json()) as ProfileResponse;

      if (!response.ok || !payload.user) {
        showErrorToast(payload.error ?? "Profile update failed.", {
          title: "Update failed",
        });
        return;
      }

      setNickname(payload.user.nickname);
      setPreferredAI(payload.user.settings.preferredAI);
      setStatusMessage("saved ♡");
      router.refresh();
    } catch {
      showErrorToast("Profile update failed.", { title: "Update failed" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <div style={{ padding: "30px 40px", background: PROF.surface }}>
        <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 32 }}>
          <div>
            <Label>01 — settings</Label>
            <div
              style={{
                marginTop: 6,
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: -0.6,
                color: PROF.ink,
                lineHeight: 1.1,
                fontFamily: 'var(--font-kaisei-tokumin), serif',
              }}
            >
              who you are
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.55, color: PROF.inkSoft }}>
              name, contact, and which brain Buni uses when he works on your resumes.
            </div>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, color: PROF.accent, fontSize: 12, fontWeight: 700 }}>
              <BuniMascot size={32} mood="idle" />
              <span style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>tip: keep email current ★</span>
            </div>
          </div>

          <form action={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: PROF.inkSoft, marginBottom: 6, fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: 0.6, textTransform: "uppercase" }}>
                  email
                </div>
                <input
                  type="email"
                  value={email}
                  disabled
                  readOnly
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: `1.5px solid ${PROF.line}`,
                    background: PROF.surfaceSoft,
                    padding: "11px 14px",
                    fontSize: 14,
                    fontWeight: 500,
                    color: PROF.inkSoft,
                    outline: "none",
                  }}
                />
              </label>

              <label style={{ display: "block" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: PROF.inkSoft, marginBottom: 6, fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: 0.6, textTransform: "uppercase" }}>
                  nickname
                </div>
                <input
                  type="text"
                  name="nickname"
                  maxLength={40}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Your display name"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: `1.5px solid ${PROF.line}`,
                    background: PROF.surface,
                    padding: "11px 14px",
                    fontSize: 14,
                    fontWeight: 500,
                    color: PROF.ink,
                    outline: "none",
                  }}
                />
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: PROF.inkSoft, marginBottom: 6, fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: 0.6, textTransform: "uppercase" }}>
                preferred ai model
              </div>
              <div
                style={{
                  borderRadius: 14,
                  border: `1.5px solid ${PROF.line}`,
                  background: PROF.surface,
                  padding: 6,
                }}
              >
                <FancySelect
                  name="preferredAI"
                  value={preferredAI}
                  onChange={setPreferredAI}
                  options={AI_PROVIDER_OPTIONS}
                />
              </div>
              <div style={{ marginTop: 10, fontSize: 11.5, color: PROF.inkSoft, fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>
                Used for uploads, tailoring, letters, and chat.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  background: "linear-gradient(135deg, #3FB37A, #4FC38A)",
                  border: "none",
                  borderRadius: 999,
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: -0.1,
                  cursor: isPending ? "not-allowed" : "pointer",
                  opacity: isPending ? 0.6 : 1,
                  boxShadow: "0 3px 10px -4px rgba(79,195,138,0.45)",
                }}
              >
                {isPending ? "saving..." : statusMessage || "save profile"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div style={{ height: 1, background: PROF.line }} />

      <div
        style={{
          position: "relative",
          padding: "36px 40px",
          background: `linear-gradient(135deg, ${PROF.deep}, ${PROF.deepSoft})`,
          color: PROF.deepInk,
          overflow: "hidden",
        }}
      >
        <svg style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} width="100%" height="100%">
          <circle cx="10%" cy="25%" r="1.2" fill="#fff" />
          <circle cx="22%" cy="70%" r="1" fill="#fff" opacity="0.6" />
          <circle cx="40%" cy="45%" r="1.5" fill="#fff" opacity="0.7" />
          <circle cx="62%" cy="20%" r="1" fill="#fff" opacity="0.5" />
          <circle cx="78%" cy="60%" r="1.3" fill="#fff" opacity="0.7" />
          <circle cx="92%" cy="35%" r="1" fill="#fff" opacity="0.6" />
          <circle cx="55%" cy="80%" r="1.1" fill="#fff" opacity="0.5" />
        </svg>

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "220px minmax(0,1fr) auto", gap: 32, alignItems: "center" }}>
          <div>
            <Label color={PROF.deepInkSoft}>02 — membership</Label>
            <div
              style={{
                marginTop: 6,
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: -1,
                color: "#fff",
                lineHeight: 1,
                fontFamily: 'var(--font-kaisei-tokumin), serif',
              }}
            >
              {membership.tier === "premium" ? "Premium ✦" : "Free tier"}
            </div>
            <span
              style={{
                display: "inline-block",
                marginTop: 10,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: PROF.actionInk,
                background: PROF.actionBg,
                padding: "3px 10px",
                borderRadius: 999,
                border: `1px solid ${PROF.actionEdge}`,
              }}
            >
              {membership.status}
            </span>
          </div>

          <div
            style={{
              padding: "18px 22px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(6px)",
            }}
          >
            <div style={{ fontSize: 12.5, color: PROF.deepInkSoft }}>
              {membership.expiresAt ? (
                <>
                  Renews <span style={{ color: "#fff", fontWeight: 700 }}>{expiryFormatter.format(new Date(membership.expiresAt))}</span>
                </>
              ) : (
                <>
                  {isPremium ? "All premium tools are unlocked." : "Free tools included. Upgrade anytime."}
                </>
              )}
              {membership.requestStatus !== "none" && membership.requestStatus !== "approved" ? (
                <span> · request {membership.requestStatus}</span>
              ) : null}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
              {[
                { k: "unlimited", v: "tailoring" },
                { k: "priority", v: "queue" },
                { k: "premium", v: "models" },
              ].map((feature) => (
                <div
                  key={feature.v}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div style={{ fontSize: 9.5, color: PROF.deepInkSoft, fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: 0.6, textTransform: "uppercase" }}>{feature.k}</div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, marginTop: 2 }}>{feature.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <PillButton href="/membership" tone="dark">Manage</PillButton>
            <PillButton href="/history" tone="dark">History</PillButton>
          </div>
        </div>
      </div>
    </>
  );
}
