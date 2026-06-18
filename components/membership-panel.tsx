"use client";

import Link from "next/link";
import { useState } from "react";
import { PageIntro } from "@/components/ui/page-intro";
import { StatusBanner } from "@/components/ui/status-banner";
import { useToast } from "@/components/ui/toast-provider";
import {
  FREE_TIER_BENEFITS,
  PREMIUM_TIER_BENEFITS,
  hasPremiumAccess,
} from "@/lib/membership";
import type { SafeUser } from "@/lib/user";

type MembershipPanelProps = {
  user: SafeUser;
};

type MembershipResponse = {
  error?: string;
  user?: SafeUser;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export function MembershipPanel({ user }: MembershipPanelProps) {
  const { showErrorToast } = useToast();
  const [membership, setMembership] = useState(user.membership);
  const [reason, setReason] = useState(membership.requestReason ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const submitRequest = async () => {
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/user/request-upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });

      const payload = (await response.json()) as MembershipResponse;

      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? "We couldn't submit your request.");
      }

      setMembership(payload.user.membership);
      setReason(payload.user.membership.requestReason);
      setStatusMessage({
        tone: "success",
        text: "Premium upgrade request submitted. An admin will review it soon.",
      });
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "We couldn't submit your request.",
        {
          title: "Membership request couldn't finish",
        },
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPremium = hasPremiumAccess(membership.tier);

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Membership"
        title="Choose how much help you want from your resume studio"
        description="Free members can already upload, tailor, and export. Premium adds comparison, cover letters, public sharing, and a conversational resume coach."
        badge="Current tier"
        aside={
          <div className="space-y-2 text-sm text-muted">
            <p className="font-semibold capitalize text-foreground">
              {membership.tier}
            </p>
            <p>Status: {membership.status}</p>
            <p>Request status: {membership.requestStatus}</p>
            {membership.expiresAt ? (
              <p>
                Expires {dateFormatter.format(new Date(membership.expiresAt))}
              </p>
            ) : null}
          </div>
        }
      />

      <section className="surface-card rounded-[2.2rem] p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <h2 className="font-[var(--font-fraunces)] text-4xl font-semibold tracking-tight text-foreground">
              Manage access to premium tools
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Upgrade when you want deeper iteration support and recruiter-facing extras.
            </p>

            {statusMessage?.tone === "success" ? (
              <StatusBanner tone="success">
                {statusMessage.text}
              </StatusBanner>
            ) : null}

            {!isPremium ? (
              <div className="dream-card p-5">
                <h2 className="text-xl font-semibold text-foreground">
                  Request premium upgrade
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted">
                  Share how you plan to use premium features so the admin review has context.
                </p>

                {membership.requestStatus === "pending" ? (
                  <StatusBanner tone="info" className="mt-4">
                    Your request is pending review.
                    {membership.requestDate
                      ? ` Submitted ${dateFormatter.format(new Date(membership.requestDate))}.`
                      : ""}
                  </StatusBanner>
                ) : null}

                {membership.requestStatus === "rejected" ? (
                  <StatusBanner tone="error" className="mt-4">
                    Your last request was not approved. You can refine the reason below and submit again.
                  </StatusBanner>
                ) : null}

                <label className="mt-5 block">
                  <span className="mb-2 block text-sm font-semibold text-foreground">
                    Why do you need premium?
                  </span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={6}
                    maxLength={500}
                    className="textarea-field"
                    placeholder="Example: I want to compare tailored versions, generate cover letters faster, and share polished public links with recruiters."
                  />
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                    {reason.trim().length}/500 characters
                  </p>
                </label>

                <button
                  type="button"
                  onClick={() => void submitRequest()}
                  disabled={isSubmitting || reason.trim().length < 20}
                  className="button-primary mt-5"
                >
                  {isSubmitting ? "Submitting..." : "Request Premium Upgrade"}
                </button>
              </div>
            ) : (
              <div className="dream-card p-5">
                <h2 className="text-xl font-semibold">Premium is active</h2>
                <p className="mt-2 text-sm leading-7">
                  Your advanced workflow is unlocked, including comparison, cover letters, public links, and the AI assistant.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/history"
                    className="button-primary !px-4 !py-2.5 !text-sm"
                  >
                    Open History
                  </Link>
                  <Link
                    href="/retail"
                    className="button-secondary !px-4 !py-2.5 !text-sm"
                  >
                    Create Cover Letter
                  </Link>
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <div className="rounded-[1.75rem] bg-[linear-gradient(145deg,#263552,#4c5b82)] p-6 text-white shadow-[0_28px_70px_-42px_rgba(38,53,82,0.58)]">
              <p className="text-xs uppercase tracking-[0.28em] text-white/60">
                Current tier
              </p>
              <p className="mt-3 font-[var(--font-fraunces)] text-5xl font-semibold capitalize">
                {membership.tier}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/70">
                Status: {membership.status}
                {membership.expiresAt
                  ? ` • Expires ${dateFormatter.format(new Date(membership.expiresAt))}`
                  : ""}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/70">
                Request status: {membership.requestStatus}
              </p>
            </div>

            <div className="surface-card rounded-[1.75rem] p-5">
              <p className="eyebrow !text-[0.62rem] !tracking-[0.26em]">
                Free includes
              </p>
              <ul className="mt-4 space-y-3">
                {FREE_TIER_BENEFITS.map((benefit) => (
                  <li
                    key={benefit.title}
                    className="dream-card px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {benefit.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {benefit.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-card rounded-[1.75rem] p-5">
              <p className="eyebrow !text-[0.62rem] !tracking-[0.26em]">
                Premium adds
              </p>
              <ul className="mt-4 space-y-3">
                {PREMIUM_TIER_BENEFITS.map((benefit) => (
                  <li
                    key={benefit.title}
                    className="dream-card px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {benefit.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {benefit.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
