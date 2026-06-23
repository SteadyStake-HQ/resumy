"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { TailoredResumeEditorModal } from "@/components/resume-tailor/TailoredResumeEditorModal";
import { buildClientEditorHtmlFromResume } from "@/lib/client-editor-html";
import { formatAIUsageCost } from "@/lib/ai-usage";
import type { SafeGeneration } from "@/lib/generation";
import type { SafeJobDescription } from "@/lib/job-description";
import { hasPremiumAccess } from "@/lib/membership";

// ── Design tokens (matching the history mockup) ──────────────────────────────
const T = {
  paper: "#fbf8f3",
  paper2: "#f5efe6",
  line: "#ece4d6",
  line2: "#ddd2bd",
  ink: "#25221f",
  ink2: "#6c6660",
  ink3: "#968f88",
  sage: "#6c8f6f",
  sage2: "#5a7c5d",
  sageBg: "#d8e6d3",
  peach: "#f4a373",
  peachBg: "#ffe6d2",
  shadowSm: "0 1px 0 rgba(60,40,20,0.04), 0 2px 6px rgba(60,40,20,0.04)",
  shadowMd: "0 1px 0 rgba(60,40,20,0.04), 0 8px 24px rgba(60,40,20,0.07)",
  shadowLg: "0 12px 40px rgba(60,40,20,0.14), 0 2px 8px rgba(60,40,20,0.06)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type ModelTag = { label: string; variant: "provider" | "fallback" | "quality" };

function parseModelTags(aiModelUsed: string): ModelTag[] {
  const lower = aiModelUsed.toLowerCase();
  const parts = lower.split("-");
  const provider = parts[0] ?? lower;
  const qualifier = parts.slice(1).join("-");
  const tags: ModelTag[] = [{ label: provider, variant: "provider" }];
  if (qualifier) {
    const variant: ModelTag["variant"] = qualifier.includes("fallback")
      ? "fallback"
      : "quality";
    tags.push({ label: qualifier, variant });
  }
  return tags;
}

function tagColors(variant: ModelTag["variant"]) {
  if (variant === "fallback")
    return { background: "#f5e8e8", color: "#7a4d4d" };
  if (variant === "quality") return { background: T.sageBg, color: T.sage2 };
  return { background: "#e8eaf5", color: "#4d4f7a" };
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3.5 8.5 6.5 11.5 12.5 5" />
    </svg>
  );
}
function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M4 4l8 8M12 4L4 12" />
    </svg>
  );
}
function IconArrowRight({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
function IconSpark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1l1.5 5.5L15 8l-5.5 1.5L8 15l-1.5-5.5L1 8l5.5-1.5z" />
    </svg>
  );
}
function IconDoc({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </svg>
  );
}
function IconBrief({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="4" width="11" height="9" rx="1.5" />
      <path d="M6 4V2.5h4V4" />
    </svg>
  );
}
function IconSearch({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M11 11l3 3" />
    </svg>
  );
}
function IconShare({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4" cy="8" r="1.7" />
      <circle cx="12" cy="3.5" r="1.7" />
      <circle cx="12" cy="12.5" r="1.7" />
      <path d="M5.5 7.2l5-2.8M5.5 8.8l5 2.8" />
    </svg>
  );
}
function IconShareOff({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4" cy="8" r="1.7" />
      <circle cx="12" cy="3.5" r="1.7" />
      <circle cx="12" cy="12.5" r="1.7" />
      <path d="M5.5 7.2l5-2.8M5.5 8.8l5 2.8" />
      <path d="M2 2l12 12" />
    </svg>
  );
}
function IconDownload({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />
    </svg>
  );
}
function IconCopy({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
    </svg>
  );
}
function IconLink({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 9.5l3-3" />
      <path d="M9 4.5l1-1a2.12 2.12 0 013 3l-1.5 1.5" />
      <path d="M7 11.5l-1 1a2.12 2.12 0 01-3-3l1.5-1.5" />
    </svg>
  );
}
function IconWand({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 13l8-8M10 4l2 2" />
      <path d="M13.5 8l.5 1.5L15.5 10l-1.5.5L13.5 12l-.5-1.5L11.5 10l1.5-.5z" />
    </svg>
  );
}
function IconRefresh({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 4v3h3" />
      <path d="M2 7a6 6 0 1110 4" />
    </svg>
  );
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
function Thumb({
  thumbnailUrl,
  templateName,
  isDesigned,
}: {
  thumbnailUrl?: string | null;
  templateName?: string | null;
  isDesigned: boolean;
}) {
  if (thumbnailUrl) {
    return (
      <div
        style={{
          width: 92,
          height: 116,
          borderRadius: 12,
          overflow: "hidden",
          border: `1px solid ${T.line}`,
          background: T.paper2,
          flexShrink: 0,
          position: "relative",
        }}
      >
        <Image
          src={thumbnailUrl}
          alt={templateName ?? "Design thumbnail"}
          fill
          className="object-cover"
        />
        <span
          style={{
            position: "absolute",
            bottom: 6,
            left: 6,
            right: 6,
            background: "rgba(255,255,255,0.7)",
            borderRadius: 6,
            padding: "3px 6px",
            fontSize: 9,
            color: "#5a4a2e",
            textAlign: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          {templateName ?? "Custom design"}
        </span>
      </div>
    );
  }

  if (isDesigned) {
    return (
      <div
        style={{
          width: 92,
          height: 116,
          borderRadius: 12,
          flexShrink: 0,
          background: "linear-gradient(180deg,#fffaf0 0%,#f6ecd6 100%)",
          border: `1px solid ${T.line}`,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          color: "#6c5c3a",
        }}
      >
        {/* line pattern overlay */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "10px 8px",
            background: `
              linear-gradient(transparent 0 6px, #c7b287 6px 7px, transparent 7px 14px) 0 0/100% 14px,
              linear-gradient(90deg, #2a1c08 0 30%, transparent 30%) 0 0/100% 4px no-repeat
            `,
            borderRadius: 2,
            opacity: 0.35,
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontWeight: 600,
            fontSize: 11,
            color: "#7a5a2e",
            opacity: 0.85,
          }}
        >
          Designed
        </div>
        <span
          style={{
            position: "absolute",
            bottom: 6,
            left: 6,
            right: 6,
            background: "rgba(255,255,255,0.7)",
            borderRadius: 6,
            padding: "3px 6px",
            fontSize: 9,
            color: "#5a4a2e",
            textAlign: "center",
          }}
        >
          export ready
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 92,
        height: 116,
        borderRadius: 12,
        flexShrink: 0,
        background: "linear-gradient(180deg,#fbe1de 0%,#f7cdcb 100%)",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        position: "relative",
        color: "#a86b65",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
          Awaiting
        </div>
        <div style={{ opacity: 0.75, fontSize: 10 }}>your touch</div>
      </div>
      <span
        style={{
          position: "absolute",
          bottom: 6,
          left: 6,
          right: 6,
          background: "rgba(255,255,255,0.55)",
          borderRadius: 6,
          padding: "3px 6px",
          fontSize: 9,
          color: "#6a4541",
          textAlign: "center",
        }}
      >
        design pending
      </span>
    </div>
  );
}

// ── JD Section ────────────────────────────────────────────────────────────────
function JDSection({
  jdId,
  title,
  company,
  onOpen,
}: {
  jdId: string | null;
  title?: string | null;
  company?: string | null;
  onOpen: () => void;
}) {
  const hasContent = Boolean(title || company);

  if (!jdId) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: "#f4f0fa",
          border: `1px dashed #d9cfe5`,
          borderRadius: 12,
          marginTop: 2,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            flexShrink: 0,
            background: "linear-gradient(135deg,#e5dcf0 0%,#d3c7e8 100%)",
            display: "grid",
            placeItems: "center",
            color: "#6a5b8a",
          }}
        >
          <IconSearch size={13} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 12.5, color: "#4e466a" }}>
            No job description on file
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "#fffaf2",
        border: `1px dashed ${T.line2}`,
        borderRadius: 12,
        marginTop: 2,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          flexShrink: 0,
          background: "linear-gradient(135deg,#ffe1b3 0%,#ffc98a 100%)",
          display: "grid",
          placeItems: "center",
          color: "#8c5a1c",
        }}
      >
        <IconBrief size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {hasContent ? (
          <>
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: T.ink,
                lineHeight: 1.3,
              }}
            >
              {title}
            </div>
            {company ? (
              <div style={{ fontSize: 12, color: T.ink2, marginTop: 1 }}>
                {company}
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ fontWeight: 500, fontSize: 12.5, color: T.ink2 }}>
            Job description attached
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          background: "#fff",
          border: `1px solid ${T.line2}`,
          borderRadius: 8,
          color: T.ink,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          flexShrink: 0,
          transition: "all 0.15s",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = T.paper2;
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#c5b599";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#fff";
          (e.currentTarget as HTMLButtonElement).style.borderColor = T.line2;
        }}
      >
        Show job description
        <IconArrowRight size={12} />
      </button>
    </div>
  );
}

// ── Icon button ───────────────────────────────────────────────────────────────
function IconBtn({
  title: tooltipTitle,
  onClick,
  href,
  download,
  children,
}: {
  title: string;
  onClick?: () => void;
  href?: string;
  download?: boolean;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    display: "inline-grid",
    placeItems: "center",
    width: 32,
    height: 32,
    borderRadius: 9,
    background: "#fff",
    border: `1px solid ${T.line}`,
    color: T.ink2,
    cursor: "pointer",
    transition: "all 0.15s",
    flexShrink: 0,
  };

  if (href) {
    return (
      <a
        href={href}
        download={download}
        title={tooltipTitle}
        aria-label={tooltipTitle}
        style={style}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltipTitle}
      aria-label={tooltipTitle}
      style={style}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = T.paper2;
        (e.currentTarget as HTMLButtonElement).style.color = T.ink;
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.line2;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "#fff";
        (e.currentTarget as HTMLButtonElement).style.color = T.ink2;
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.line;
      }}
    >
      {children}
    </button>
  );
}

// ── JD Modal ──────────────────────────────────────────────────────────────────
type JdModalState =
  | { status: "idle" }
  | { status: "loading"; jdId: string }
  | { status: "ready"; jd: SafeJobDescription }
  | { status: "error"; message: string };

function JobDescriptionModal({
  open,
  state,
  onClose,
}: {
  open: boolean;
  state: JdModalState;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        className="fixed inset-0"
        style={{
          background: "rgba(40,30,20,0.45)",
          backdropFilter: "blur(8px)",
        }}
      />
      <div className="fixed inset-0 flex items-center justify-center p-5">
        <DialogPanel
          style={{
            width: "100%",
            maxWidth: 720,
            maxHeight: "86vh",
            background: T.paper,
            borderRadius: 22,
            boxShadow: T.shadowLg,
            border: `1px solid ${T.line}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Loading */}
          {state.status === "loading" && (
            <div
              style={{
                padding: "40px 24px",
                textAlign: "center",
                color: T.ink2,
                fontSize: 14,
              }}
            >
              Loading job description…
            </div>
          )}

          {/* Error */}
          {state.status === "error" && (
            <>
              <div
                style={{
                  padding: "22px 24px 16px",
                  borderBottom: `1px solid ${T.line}`,
                  background: "linear-gradient(180deg,#fff8ea 0%,#fbf8f3 100%)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                <DialogTitle
                  style={{
                    fontFamily: "inherit",
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 600,
                    color: T.ink,
                  }}
                >
                  Couldn&apos;t load job description
                </DialogTitle>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.6)",
                    border: `1px solid ${T.line}`,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    color: T.ink2,
                  }}
                >
                  <IconX />
                </button>
              </div>
              <div
                style={{ padding: "20px 24px", color: "#b54a3e", fontSize: 13 }}
              >
                {state.message}
              </div>
              <div
                style={{
                  padding: "12px 24px",
                  borderTop: `1px solid ${T.line}`,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    background: "#fff",
                    border: `1px solid ${T.line2}`,
                    color: T.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Close
                </button>
              </div>
            </>
          )}

          {/* No-JD empty state */}
          {state.status === "idle" && (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  margin: "0 auto 14px",
                  borderRadius: 18,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(135deg,#ece2f5 0%,#d4c5e8 100%)",
                  color: "#6a5b8a",
                }}
              >
                <IconBrief size={28} />
              </div>
              <h3
                style={{
                  fontFamily: "inherit",
                  fontSize: 22,
                  fontWeight: 600,
                  color: T.ink,
                  margin: "0 0 6px",
                }}
              >
                No job description on file
              </h3>
              <p
                style={{
                  color: T.ink2,
                  fontSize: 13,
                  margin: "0 auto",
                  maxWidth: 360,
                  lineHeight: 1.55,
                }}
              >
                No job description was saved with this generation.
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    background: "#fff",
                    border: `1px solid ${T.line2}`,
                    color: T.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Ready */}
          {state.status === "ready" && (
            <>
              {/* Header */}
              <div
                style={{
                  padding: "22px 24px 16px",
                  borderBottom: `1px solid ${T.line}`,
                  background: "linear-gradient(180deg,#fff8ea 0%,#fbf8f3 100%)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: T.peach,
                      fontWeight: 600,
                      fontFamily: "monospace",
                      marginBottom: 4,
                    }}
                  >
                    Job Description
                  </div>
                  <DialogTitle
                    style={{
                      fontFamily: "var(--font-fraunces, 'Georgia', serif)",
                      fontSize: 28,
                      lineHeight: 1.1,
                      margin: "0 0 8px",
                      color: T.ink,
                      fontWeight: 400,
                    }}
                  >
                    {state.jd.title || "Untitled Position"}
                  </DialogTitle>
                  {state.jd.company ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        color: T.ink2,
                      }}
                    >
                      <strong style={{ color: T.ink, fontWeight: 600 }}>
                        {state.jd.company}
                      </strong>
                      <span
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: "50%",
                          background: T.ink3,
                          display: "inline-block",
                        }}
                      />
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <IconDoc size={11} />{" "}
                        {/* no filename in SafeJobDescription */}
                        Saved job description
                      </span>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    flexShrink: 0,
                    background: "rgba(255,255,255,0.6)",
                    border: `1px solid ${T.line}`,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    color: T.ink2,
                  }}
                >
                  <IconX />
                </button>
              </div>

              {/* Body */}
              <div
                style={{
                  padding: "20px 24px 24px",
                  overflowY: "auto",
                  flex: 1,
                }}
              >
                {state.jd.parsedKeywords.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: T.ink3,
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      Surfaced keywords
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "4px 6px",
                        marginBottom: 18,
                      }}
                    >
                      {state.jd.parsedKeywords.map((kw) => (
                        <span
                          key={kw}
                          style={{
                            display: "inline-block",
                            padding: "2px 7px",
                            background: T.paper2,
                            border: `1px solid ${T.line}`,
                            borderRadius: 6,
                            fontFamily: "monospace",
                            fontSize: 11,
                            color: T.ink,
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: T.ink3,
                    marginBottom: 8,
                    fontWeight: 600,
                  }}
                >
                  Full description
                </div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    lineHeight: 1.65,
                    color: "#3a342e",
                    margin: 0,
                  }}
                >
                  {state.jd.content}
                </pre>
              </div>

              {/* Footer */}
              <div
                style={{
                  borderTop: `1px solid ${T.line}`,
                  padding: "14px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: T.paper,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: T.ink2,
                    fontSize: 12,
                  }}
                >
                  <IconSpark size={12} />
                  <span style={{ color: T.peach }}>✦</span>
                  Used to tailor your resume
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    background: "#fff",
                    border: `1px solid ${T.line2}`,
                    color: T.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Close
                </button>
              </div>
            </>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type GenerationHistoryProps = {
  generations: SafeGeneration[];
  membershipTier: string;
};

// ── Main component ────────────────────────────────────────────────────────────
export function GenerationHistory({
  generations,
  membershipTier,
}: GenerationHistoryProps) {
  const router = useRouter();
  const { showErrorToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<{
    generationId: string;
    url: string;
  } | null>(null);

  const [jdModalOpen, setJdModalOpen] = useState(false);
  const [jdModalState, setJdModalState] = useState<JdModalState>({
    status: "idle",
  });
  const jdCacheRef = useRef<Record<string, SafeJobDescription>>({});
  const [editorGeneration, setEditorGeneration] = useState<SafeGeneration | null>(null);
  const [editorHtml, setEditorHtml] = useState("");

  const hasPremium = hasPremiumAccess(membershipTier);
  const compareUrl = useMemo(
    () => `/compare?ids=${selectedIds.join(",")}`,
    [selectedIds],
  );
  const compareReady = selectedIds.length === 2;

  const openEditor = (generation: SafeGeneration) => {
    setEditorGeneration(generation);
    setEditorHtml(
      generation.editorHtml || buildClientEditorHtmlFromResume(generation.tailoredData),
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const baseUrl = window.location.origin;
    setShareLinks(
      Object.fromEntries(
        generations
          .filter((g) => g.publicId)
          .map((g) => [g.id, `${baseUrl}/public/${g.publicId}`]),
      ),
    );
  }, [generations]);

  const toggleSelection = (id: string) => {
    setSelectedIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      return [...cur, id].slice(-2);
    });
  };

  const toggleShare = async (generation: SafeGeneration) => {
    if (!hasPremium) {
      router.push("/membership");
      return;
    }
    try {
      const response = await fetch(`/api/generation/${generation.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !shareLinks[generation.id] }),
      });
      const payload = (await response.json()) as {
        error?: string;
        publicUrl?: string | null;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "We couldn't update the share link.");
      setShareLinks((cur) => {
        const next = { ...cur };
        if (payload.publicUrl) {
          next[generation.id] = payload.publicUrl;
          setShareToast({
            generationId: generation.id,
            url: payload.publicUrl,
          });
        } else {
          delete next[generation.id];
          setShareToast(null);
        }
        return next;
      });
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "We couldn't update the share link.",
        { title: "Share link couldn't be updated" },
      );
    }
  };

  const copyShareLink = async (generationId: string) => {
    const link = shareLinks[generationId];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(generationId);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      showErrorToast("Clipboard access failed in this browser session.", {
        title: "Share link couldn't be copied",
      });
    }
  };

  const openJdModal = async (jdId: string) => {
    setJdModalOpen(true);
    if (jdCacheRef.current[jdId]) {
      setJdModalState({ status: "ready", jd: jdCacheRef.current[jdId] });
      return;
    }
    setJdModalState({ status: "loading", jdId });
    try {
      const res = await fetch(`/api/job-description/${jdId}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as {
        error?: string;
        jobDescription?: SafeJobDescription;
      };
      if (!res.ok || !payload.jobDescription) {
        throw new Error(payload.error ?? "Could not load the job description.");
      }
      jdCacheRef.current[jdId] = payload.jobDescription;
      setJdModalState({ status: "ready", jd: payload.jobDescription });
    } catch (error) {
      setJdModalState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not load the job description.",
      });
    }
  };

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!generations.length) {
    return (
      <div
        style={{
          background: T.paper,
          border: `1px solid ${T.line}`,
          borderRadius: 22,
          padding: "40px 32px",
          textAlign: "center",
          boxShadow: T.shadowSm,
        }}
      >
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: T.peach,
            fontWeight: 600,
            fontFamily: "monospace",
          }}
        >
          History
        </p>
        <h1 className="mt-3 font-[var(--font-fraunces)] text-4xl font-semibold tracking-tight text-foreground">
          No tailored resumes yet
        </h1>
        <p
          style={{
            marginTop: 12,
            fontSize: 13,
            color: T.ink2,
            maxWidth: 440,
            margin: "12px auto 0",
            lineHeight: 1.6,
          }}
        >
          Once you tailor a resume to a job description, it will appear here
          with the original source and job context attached.
        </p>
        <Link href="/retail" className="button-primary mt-6">
          Open Retailing
        </Link>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px",
      }}
    >
      {/* Share toast */}
      {shareToast && shareLinks[shareToast.generationId] ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 16px",
            background: "#e9f3ea",
            border: `1px solid #c7e0c9`,
            borderLeft: `3px solid ${T.sage}`,
            borderRadius: 14,
            color: "#2e4a31",
            boxShadow: T.shadowSm,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "#d4e8d6",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              color: T.sage2,
            }}
          >
            <IconLink size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#2c4030" }}>
              Public share link is ready
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#5a7560",
                marginTop: 2,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>
                {shareToast.url}
              </span>
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "#99b8a0",
                  display: "inline-block",
                }}
              />
              <span>Anyone with the link can view</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => void copyShareLink(shareToast.generationId)}
              style={{
                background: "transparent",
                border: "none",
                color: "#4a6a4f",
                cursor: "pointer",
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "inherit",
              }}
            >
              {copiedId === shareToast.generationId ? "Copied ✓" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={() => setShareToast(null)}
              aria-label="Dismiss"
              style={{
                background: "transparent",
                border: "none",
                color: "#769878",
                cursor: "pointer",
                width: 28,
                height: 28,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
              }}
            >
              <IconX size={12} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Compare bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: T.paper,
          border: `1px solid ${T.line}`,
          borderRadius: 14,
          padding: "10px 12px",
          boxShadow: T.shadowSm,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px 8px 10px",
            background: compareReady
              ? T.sage
              : selectedIds.length > 0
                ? T.sage2
                : T.ink,
            color: T.paper,
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: compareReady
              ? `0 0 0 4px rgba(108,143,111,0.15)`
              : undefined,
            transition: "all 0.2s",
          }}
        >
          <IconSpark size={12} />
          Compare selected
          <span
            style={{
              background: "rgba(255,255,255,0.18)",
              padding: "3px 8px",
              borderRadius: 999,
              fontVariantNumeric: "tabular-nums",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {selectedIds.length}/2
          </span>
        </span>

        <span style={{ color: T.ink2, fontSize: 12.5, flex: 1 }}>
          {compareReady ? (
            <>
              <strong style={{ color: T.ink, fontWeight: 600 }}>Ready.</strong>{" "}
              Click to diff content, skills, and structure across the two
              selected generations.
            </>
          ) : selectedIds.length === 1 ? (
            <>
              Pick{" "}
              <strong style={{ color: T.ink, fontWeight: 600 }}>
                one more
              </strong>{" "}
              generation to compare.
            </>
          ) : (
            <>
              Select{" "}
              <strong style={{ color: T.ink, fontWeight: 600 }}>
                exactly two
              </strong>{" "}
              generations to compare.
            </>
          )}
        </span>

        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            style={{
              background: "transparent",
              border: "none",
              color: T.ink2,
              cursor: "pointer",
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 8,
              fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        )}
        {compareReady && (
          <button
            type="button"
            onClick={() =>
              hasPremium ? router.push(compareUrl) : router.push("/membership")
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 500,
              background: T.sage,
              color: "#fff",
              border: "none",
              cursor: "pointer",
              boxShadow: `0 1px 0 ${T.sage2}, 0 2px 6px rgba(108,143,111,0.25)`,
              fontFamily: "inherit",
            }}
          >
            Diff selected <IconArrowRight size={12} />
          </button>
        )}
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gap: 10 }}>
        {generations.map((generation) => {
          const isDesigned = Boolean(
            generation.generatedFiles.pdfUrl ||
            generation.generatedFiles.docxUrl,
          );
          const isSelected = selectedIds.includes(generation.id);
          const hasShareLink = Boolean(shareLinks[generation.id]);
          const modelTags = parseModelTags(generation.aiModelUsed);

          return (
            <article
              key={generation.id}
              style={{
                background: isSelected
                  ? "linear-gradient(180deg,#f8f4ec 0%,#f3ede1 100%)"
                  : T.paper,
                border: `1px solid ${isSelected ? T.sage : T.line}`,
                borderRadius: 18,
                padding: "16px 18px",
                display: "grid",
                gridTemplateColumns: "92px 1fr auto",
                gap: 16,
                alignItems: "stretch",
                boxShadow: isSelected
                  ? `0 0 0 3px rgba(108,143,111,0.16), ${T.shadowMd}`
                  : T.shadowSm,
                transition: "all 0.2s cubic-bezier(.2,.8,.2,1)",
              }}
            >
              {/* Thumbnail */}
              <Thumb
                thumbnailUrl={generation.designTemplate?.thumbnailUrl}
                templateName={generation.designTemplate?.name}
                isDesigned={isDesigned}
              />

              {/* Body */}
              <div
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {/* Top row: checkbox + filename + status */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px 4px 6px",
                      borderRadius: 8,
                      cursor: "pointer",
                      userSelect: "none",
                      color: isSelected ? T.sage2 : T.ink2,
                      fontSize: 11.5,
                      fontWeight: isSelected ? 500 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isSelected}
                      onChange={() => toggleSelection(generation.id)}
                    />
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 5,
                        display: "grid",
                        placeItems: "center",
                        border: `1.5px solid ${isSelected ? T.sage : T.line2}`,
                        background: isSelected ? T.sage : "#fff",
                        transition: "all 0.15s",
                        flexShrink: 0,
                      }}
                    >
                      {isSelected ? <IconCheck size={10} /> : null}
                    </span>
                    Compare
                  </label>

                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14.5,
                      color: T.ink,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span style={{ color: T.peach }}>
                      <IconDoc size={13} />
                    </span>
                    {generation.sourceResume?.fileName ?? "Resume"}
                  </span>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 8px",
                      borderRadius: 999,
                      fontSize: 10.5,
                      fontWeight: 500,
                      background: isDesigned ? T.sageBg : T.peachBg,
                      color: isDesigned ? T.sage2 : "#8c5a1c",
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "currentColor",
                        opacity: 0.7,
                      }}
                    />
                    {isDesigned ? "Design ready" : "Awaiting design"}
                  </span>
                </div>

                {/* Meta row: tags + date */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    fontSize: 11.5,
                    color: T.ink2,
                  }}
                >
                  {modelTags.map((tag) => (
                    <span
                      key={tag.label}
                      style={{
                        ...tagColors(tag.variant),
                        padding: "3px 8px",
                        borderRadius: 999,
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        fontFamily: "monospace",
                      }}
                    >
                      {tag.label}
                    </span>
                  ))}
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: "50%",
                      background: T.ink3,
                      display: "inline-block",
                    }}
                  />
                  <span>
                    {generation.createdAt
                      ? dateFormatter.format(new Date(generation.createdAt))
                      : "Recently generated"}
                  </span>
                  {generation.aiUsage ? (
                    <>
                      <span
                        style={{ width: 3, height: 3, borderRadius: "50%", background: T.ink3 }}
                      />
                      <span style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>
                        {generation.aiUsage.totalTokens.toLocaleString()} tokens · {formatAIUsageCost(generation.aiUsage.estimatedCostUsd)}
                      </span>
                    </>
                  ) : null}
                </div>

                {/* JD section */}
                <JDSection
                  jdId={generation.jobDescriptionId}
                  title={generation.jobDescription?.title}
                  company={generation.jobDescription?.company}
                  onOpen={() =>
                    generation.jobDescriptionId &&
                    void openJdModal(generation.jobDescriptionId)
                  }
                />

                {/* Share link row */}
                {hasShareLink ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: "#fff",
                      border: `1px solid ${T.line}`,
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ color: T.sage2, flexShrink: 0 }}>
                      <IconLink size={14} />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: T.ink2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {shareLinks[generation.id]}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyShareLink(generation.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 500,
                        background: "#fff",
                        border: `1px solid ${T.line2}`,
                        color: T.ink,
                        cursor: "pointer",
                        flexShrink: 0,
                        fontFamily: "inherit",
                      }}
                    >
                      {copiedId === generation.id ? (
                        <>
                          <span style={{ color: T.sage }}>
                            <IconCheck size={12} />
                          </span>{" "}
                          Copied
                        </>
                      ) : (
                        <>
                          <IconCopy size={12} /> Copy link
                        </>
                      )}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  gap: 8,
                  minWidth: 150,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    alignItems: "stretch",
                    width: "100%",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openEditor(generation)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: "9px 14px",
                      borderRadius: 10,
                      fontSize: 12.5,
                      fontWeight: 500,
                      background: T.sage,
                      color: "#fff",
                      textDecoration: "none",
                      boxShadow: `0 1px 0 ${T.sage2}, 0 2px 6px rgba(108,143,111,0.25)`,
                      whiteSpace: "nowrap",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {isDesigned ? (
                      <>
                        <IconRefresh size={13} /> Refine design
                      </>
                    ) : (
                      <>
                        <IconWand size={13} /> Customize design
                      </>
                    )}
                  </button>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      justifyContent: "flex-end",
                    }}
                  >
                    {generation.generatedFiles.pdfUrl ? (
                      <IconBtn
                        title="Download PDF"
                        href={generation.generatedFiles.pdfUrl}
                        download
                      >
                        <IconDownload size={14} />
                      </IconBtn>
                    ) : null}
                    {generation.generatedFiles.docxUrl ? (
                      <IconBtn
                        title="Download DOCX"
                        href={generation.generatedFiles.docxUrl}
                        download
                      >
                        <IconDownload size={14} />
                      </IconBtn>
                    ) : null}
                    <IconBtn
                      title={
                        hasShareLink
                          ? "Disable share"
                          : hasPremium
                            ? "Share"
                            : "Premium share"
                      }
                      onClick={() => void toggleShare(generation)}
                    >
                      {hasShareLink ? (
                        <IconShareOff size={14} />
                      ) : (
                        <IconShare size={14} />
                      )}
                    </IconBtn>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* JD Modal */}
      <JobDescriptionModal
        open={jdModalOpen}
        state={jdModalState}
        onClose={() => setJdModalOpen(false)}
      />
      <TailoredResumeEditorModal
        open={Boolean(editorGeneration)}
        task={null}
        generation={editorGeneration}
        statusLabel="Tailored resume ready"
        editorHtml={editorHtml}
        sections={[]}
        isStreaming={false}
        error={null}
        onClose={() => setEditorGeneration(null)}
        onCancelGeneration={() => setEditorGeneration(null)}
        onEditorHtmlChange={setEditorHtml}
        onGenerationSaved={setEditorGeneration}
        onOpenEditPage={(generationId) => router.push(`/tailor/editor/${generationId}`)}
      />
    </div>
  );
}
