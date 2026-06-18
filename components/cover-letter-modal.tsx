"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingOrb } from "@/components/ui/loading-orb";
import { StatusBanner } from "@/components/ui/status-banner";
import { useToast } from "@/components/ui/toast-provider";
import { notifyGeminiRouterRefresh } from "@/lib/client-api";
import type { SafeGeneration } from "@/lib/generation";
import { hasPremiumAccess } from "@/lib/membership";

type CoverLetterModalProps = {
  generation: SafeGeneration | null;
  membershipTier: string;
  onClose: () => void;
};

type CoverLetterResponse = {
  error?: string;
  coverLetter?: string;
  aiModelUsed?: string;
};

type CoverLetterPdfResponse = {
  error?: string;
  pdfUrl?: string;
};

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function CoverLetterModal({
  generation,
  membershipTier,
  onClose,
}: CoverLetterModalProps) {
  const { showErrorToast } = useToast();
  const [coverLetter, setCoverLetter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setCoverLetter("");
    setStatusMessage(null);
  }, [generation?.id]);

  useEffect(() => {
    if (!generation || !hasPremiumAccess(membershipTier)) {
      return;
    }

    if (coverLetter || isLoading) {
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    fetch("/api/cover-letter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationId: generation.id,
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as CoverLetterResponse;

        if (!response.ok || !payload.coverLetter) {
          throw new Error(
            payload.error ?? "We couldn't generate the cover letter.",
          );
        }

        setCoverLetter(payload.coverLetter);
      })
      .catch((error) => {
        showErrorToast(
          error instanceof Error
            ? error.message
            : "We couldn't generate the cover letter.",
          {
            title: "Cover letter couldn't be generated",
          },
        );
      })
      .finally(() => {
        setIsLoading(false);
        notifyGeminiRouterRefresh();
      });
  }, [coverLetter, generation, isLoading, membershipTier, showErrorToast]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coverLetter);
      setStatusMessage({
        tone: "success",
        text: "Cover letter copied to clipboard.",
      });
    } catch {
      showErrorToast("Clipboard access failed in this browser session.", {
        title: "Cover letter couldn't be copied",
      });
    }
  };

  const handleDownloadPdf = async () => {
    if (!generation || !coverLetter) {
      return;
    }

    setIsDownloading(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/cover-letter/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId: generation.id,
          coverLetter,
        }),
      });

      const payload = (await response.json()) as CoverLetterPdfResponse;

      if (!response.ok || !payload.pdfUrl) {
        throw new Error(
          payload.error ?? "We couldn't generate the PDF version.",
        );
      }

      window.open(payload.pdfUrl, "_blank", "noopener,noreferrer");
      setStatusMessage({
        tone: "success",
        text: "Cover letter PDF is ready.",
      });
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "We couldn't generate the PDF version.",
        {
          title: "Cover letter PDF couldn't be generated",
        },
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={Boolean(generation)} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-foreground/45 backdrop-blur-sm" />

      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className="surface-card w-full max-w-4xl rounded-[2.3rem] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Cover letter</p>
                <DialogTitle className="mt-2 font-[var(--font-fraunces)] text-3xl font-semibold text-foreground">
                  {generation?.jobDescription?.title || "Job-specific cover letter"}
                </DialogTitle>
                <p className="mt-2 text-sm text-muted">
                  Based on your tailored generation and current job context.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close cover letter"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-white/70 text-muted transition hover:bg-white hover:text-foreground"
              >
                <CloseIcon />
              </button>
            </div>

            {statusMessage?.tone === "success" ? (
              <StatusBanner
                tone="success"
                className="mt-6"
              >
                {statusMessage.text}
              </StatusBanner>
            ) : null}

            {!hasPremiumAccess(membershipTier) ? (
              <div className="dream-card mt-6 p-6 text-center">
                <h3 className="text-xl font-semibold text-foreground">
                  Premium unlocks cover letters
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Upgrade to premium to generate role-specific cover letters and export them as PDF.
                </p>
                <Link
                  href="/membership"
                  className="button-primary mt-5 !px-5 !py-3 !text-sm"
                >
                  Open Membership
                </Link>
              </div>
            ) : isLoading ? (
              <div className="mt-6">
                <LoadingOrb label="Drafting your cover letter..." />
              </div>
            ) : (
              <>
                <div className="mt-6 rounded-[1.75rem] border border-line bg-white/90 p-5">
                  <div className="space-y-4 whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {coverLetter || "No cover letter text available."}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    disabled={!coverLetter}
                    className="button-primary !px-5 !py-3 !text-sm"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf()}
                    disabled={!coverLetter || isDownloading}
                    className="button-secondary !px-5 !py-3 !text-sm"
                  >
                    {isDownloading ? "Preparing PDF..." : "Download as PDF"}
                  </button>
                </div>
              </>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
