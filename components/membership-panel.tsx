"use client";

import Link from "next/link";
import { useState } from "react";
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
    <div className="bg-[#fbf8f3] text-[#25221f]">
      <section className="border-b border-[#e8dfd1] px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#6c8f6f]">
              01 / plan overview
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-[#25221f] sm:text-4xl">
              Choose the toolkit that fits your search.
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#6c6660]">
              Start with the essentials, then unlock deeper comparison,
              publishing, and coaching tools when you need them.
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#ddd2bd] bg-[#ddd2bd] sm:min-w-[22rem]">
            <div className="bg-white px-4 py-3">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[#968f88]">
                Current plan
              </p>
              <p className="mt-1 text-lg font-bold capitalize">{membership.tier}</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[#968f88]">
                Access
              </p>
              <p className="mt-1 text-lg font-bold capitalize">{membership.status}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid border-b border-[#e8dfd1] lg:grid-cols-2">
        <PlanColumn
          label="Free"
          description="A complete foundation for building and exporting strong applications."
          benefits={FREE_TIER_BENEFITS}
          active={!isPremium}
          tone="sage"
        />
        <PlanColumn
          label="Premium"
          description="Advanced tools for faster iteration and polished recruiter-facing work."
          benefits={PREMIUM_TIER_BENEFITS}
          active={isPremium}
          tone="peach"
        />
      </section>

      <section className="grid lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="border-b border-[#e8dfd1] bg-[#25221f] px-5 py-8 text-white sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#a9c6aa]">
            02 / membership status
          </p>
          <p className="mt-4 font-display text-4xl font-bold capitalize">
            {membership.tier}
          </p>
          <div className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm text-white/70">
            <p>Status: <span className="font-semibold text-white">{membership.status}</span></p>
            <p>Request: <span className="font-semibold text-white">{membership.requestStatus}</span></p>
            {membership.expiresAt ? (
              <p>Expires: <span className="font-semibold text-white">{dateFormatter.format(new Date(membership.expiresAt))}</span></p>
            ) : null}
          </div>
        </aside>

        <div className="px-5 py-8 sm:px-8 lg:px-10">
          {statusMessage?.tone === "success" ? (
            <StatusBanner tone="success" className="mb-5">
              {statusMessage.text}
            </StatusBanner>
          ) : null}

          {!isPremium ? (
            <div>
              <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#c47752]">
                Request access
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold">
                Tell us how premium would help.
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[#6c6660]">
                A little context helps the admin review your request quickly.
              </p>

              {membership.requestStatus === "pending" ? (
                <StatusBanner tone="info" className="mt-5">
                  Your request is pending review.
                  {membership.requestDate
                    ? ` Submitted ${dateFormatter.format(new Date(membership.requestDate))}.`
                    : ""}
                </StatusBanner>
              ) : null}

              {membership.requestStatus === "rejected" ? (
                <StatusBanner tone="error" className="mt-5">
                  Your last request was not approved. Update the reason and try again.
                </StatusBanner>
              ) : null}

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-bold">Why do you need premium?</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={5}
                  maxLength={500}
                  className="w-full resize-y rounded-lg border border-[#ddd2bd] bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#6c8f6f] focus:ring-2 focus:ring-[#6c8f6f]/15"
                  placeholder="I want to compare tailored versions, create cover letters, and share polished links with recruiters."
                />
                <span className="mt-2 block text-right font-mono text-[0.65rem] text-[#968f88]">
                  {reason.trim().length} / 500
                </span>
              </label>

              <button
                type="button"
                onClick={() => void submitRequest()}
                disabled={isSubmitting || reason.trim().length < 20}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#25221f] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#3b3732] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSubmitting ? "Submitting..." : "Request premium access"}
              </button>
            </div>
          ) : (
            <div>
              <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#6c8f6f]">
                Premium active
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold">
                Your full studio is ready.
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[#6c6660]">
                Comparison, cover letters, public links, and the resume coach are all unlocked.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/history" className="button-primary !px-5 !py-3 !text-sm">
                  Open history
                </Link>
                <Link href="/retail" className="button-secondary !px-5 !py-3 !text-sm">
                  Create cover letter
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PlanColumn({
  label,
  description,
  benefits,
  active,
  tone,
}: {
  label: string;
  description: string;
  benefits: Array<{ title: string; description: string }>;
  active: boolean;
  tone: "sage" | "peach";
}) {
  const accent = tone === "sage" ? "#6c8f6f" : "#c47752";
  const tint = tone === "sage" ? "#edf3e9" : "#fff0e5";

  return (
    <article className="border-b border-[#e8dfd1] px-5 py-8 last:border-b-0 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:last:border-r-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em]" style={{ color: accent }}>
            {label} plan
          </p>
          <h3 className="mt-2 font-display text-3xl font-bold">{label}</h3>
        </div>
        {active ? (
          <span className="rounded-full px-3 py-1 font-mono text-[0.62rem] font-bold uppercase tracking-[0.1em]" style={{ background: tint, color: accent }}>
            Current
          </span>
        ) : null}
      </div>
      <p className="mt-3 max-w-xl text-sm leading-7 text-[#6c6660]">{description}</p>
      <ul className="mt-6 divide-y divide-[#e8dfd1] border-y border-[#e8dfd1]">
        {benefits.map((benefit, index) => (
          <li key={benefit.title} className="grid grid-cols-[2rem_1fr] gap-3 py-4">
            <span className="grid h-7 w-7 place-items-center rounded-lg font-mono text-[0.65rem] font-bold" style={{ background: tint, color: accent }}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-sm font-bold">{benefit.title}</p>
              <p className="mt-1 text-sm leading-6 text-[#6c6660]">{benefit.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
