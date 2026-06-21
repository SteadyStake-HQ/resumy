"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingOrb } from "@/components/ui/loading-orb";
import { TailoredResumeEditorModal } from "@/components/resume-tailor/TailoredResumeEditorModal";
import { useToast } from "@/components/ui/toast-provider";
import {
  normalizeResumeCustomization,
  type ResumeCustomization,
  type SafeDesignTemplate,
} from "@/lib/design-template";
import {
  notifyGeminiRouterRefresh,
  readApiResponse,
} from "@/lib/client-api";
import { buildBinaryUploadHeaders } from "@/lib/file-upload";
import type { SafeBackgroundTask } from "@/lib/background-task";
import type { SafeGeneration } from "@/lib/generation";
import type { SafeJobDescription } from "@/lib/job-description";
import { hasPremiumAccess } from "@/lib/membership";
import type { ResumeSummary } from "@/lib/resume";

const CoverLetterModal = dynamic(
  async () => (await import("@/components/cover-letter-modal")).CoverLetterModal,
  { ssr: false },
);

type RetailWorkspaceProps = {
  resumes: ResumeSummary[];
  jobDescriptions: SafeJobDescription[];
  initialResumeId?: string;
  initialGeneration?: SafeGeneration | null;
  initialTemplate?: SafeDesignTemplate | null;
  initialOpenDownloadModal?: boolean;
  membershipTier: string;
};

type TailorTaskResponse = {
  error?: string;
  task?: SafeBackgroundTask;
  initialStatus?: SafeBackgroundTask["status"];
};

type GenerationResponse = {
  error?: string;
  generation?: SafeGeneration;
};

type ExtractJobDescriptionResponse = {
  error?: string;
  content?: string;
  title?: string;
};

type TemplatesResponse = {
  error?: string;
  templates?: SafeDesignTemplate[];
};

type GenerateFilesResponse = {
  error?: string;
  pdfUrl?: string;
  docxUrl?: string;
  generation?: SafeGeneration | null;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const POLL_INTERVAL_MS = 1000;
const TAILOR_THEME = {
  paper: "#FBF7F0",
  paperWarm: "#F6EFE0",
  paperDeep: "#EDE2CC",
  ink: "#1A1410",
  ink2: "#3A2E24",
  ink3: "#6B5B4A",
  ink4: "#9A8B78",
  rule: "#E0D3BB",
  ruleSoft: "#EFE6D2",
  amber: "#C9651C",
  amberSoft: "#F4D8A8",
  amberWash: "#FBE9CC",
  moss: "#5A6B3A",
};

function TailorEyebrow({
  children,
  color = TAILOR_THEME.ink3,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--font-ibm-plex-mono), monospace",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 1.7,
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </span>
  );
}

function TailorStatus({ status }: { status: "done" | "active" | "pending" }) {
  const label =
    status === "done" ? "Complete" : status === "active" ? "In progress" : "Up next";
  const color =
    status === "done"
      ? TAILOR_THEME.moss
      : status === "active"
        ? TAILOR_THEME.ink2
        : TAILOR_THEME.ink4;
  const dot =
    status === "done"
      ? TAILOR_THEME.moss
      : status === "active"
        ? TAILOR_THEME.amber
        : TAILOR_THEME.ink4;

  return (
    <div
      style={{
        position: "absolute",
        top: 24,
        right: 32,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-ibm-plex-mono), monospace",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dot,
        }}
      />
      {label}
    </div>
  );
}

function TailorStepCard({
  index,
  title,
  kicker,
  status,
  children,
}: {
  index: number;
  title: string;
  kicker: string;
  status: "done" | "active" | "pending";
  children: React.ReactNode;
}) {
  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${TAILOR_THEME.rule}`,
        borderRadius: 18,
        background: TAILOR_THEME.paper,
        padding: "clamp(24px, 5vw, 44px) clamp(20px, 6vw, 56px)",
      }}
    >
      <TailorStatus status={status} />
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 24,
          alignItems: "start",
          marginBottom: 28,
        }}
      >
        <div
          style={{
            paddingTop: 4,
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontSize: 56,
            fontWeight: 300,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: status === "pending" ? TAILOR_THEME.ink4 : TAILOR_THEME.ink,
          }}
        >
          {String(index).padStart(2, "0")}
        </div>
        <div style={{ paddingTop: 14 }}>
          <TailorEyebrow>{kicker}</TailorEyebrow>
          <h2
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--font-fraunces), Georgia, serif",
              fontSize: 26,
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: "-0.012em",
              color: TAILOR_THEME.ink,
            }}
          >
            {title}
          </h2>
        </div>
      </header>
      {children}
    </article>
  );
}

function FileGlyph({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        width: 28,
        height: 34,
        flexShrink: 0,
        borderRadius: 3,
        background: selected ? TAILOR_THEME.amber : TAILOR_THEME.paperDeep,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 9,
          height: 9,
          background: TAILOR_THEME.paper,
          clipPath: "polygon(0 0, 100% 100%, 0 100%)",
        }}
      />
    </span>
  );
}

function getWordCount(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function getTailoringProgressCap(task: SafeBackgroundTask | null) {
  if (!task) return 0;

  if (task.status === "completed") return 100;
  if (task.status === "failed" || task.status === "canceled") {
    return task.progressPercent;
  }

  switch (task.stageKey) {
    case "queued":
    case "starting":
      return 8;
    case "loading_resume":
      return 16;
    case "analyzing_job_description":
      return 34;
    case "building_prompt":
      return 44;
    case "tailoring":
      return 78;
    case "validating":
      return 88;
    case "saving":
      return 96;
    default:
      return Math.max(task.progressPercent, 12);
  }
}

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.target = "_blank";
  document.body.append(link);
  link.click();
  link.remove();
}

function createOptimisticTailoringTask(input: {
  clientTaskId: string;
  resumeFileName: string;
}): SafeBackgroundTask {
  const now = new Date().toISOString();

  return {
    id: `optimistic-${input.clientTaskId}`,
    type: "resume_tailoring",
    status: "pending",
    title: "Resume tailoring",
    fileName: input.resumeFileName,
    stageKey: "starting",
    stageLabel: "Starting tailoring",
    progressPercent: 2,
    error: null,
    resultResumeId: null,
    resultGenerationId: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    events: [
      {
        label: "Starting tailoring",
        tone: "info",
        createdAt: now,
      },
    ],
    debugData: { clientTaskId: input.clientTaskId },
    canDismiss: false,
    canRetry: false,
    canCancel: false,
  };
}

function TailorCompletionModal({
  generation,
  previewUrl,
  templateError,
  isLoadingTemplates,
  activeDownload,
  canExport,
  onClose,
  onDownload,
  onCustomize,
}: {
  generation: SafeGeneration | null;
  previewUrl: string;
  templateError: string;
  isLoadingTemplates: boolean;
  activeDownload: "pdf" | "docx" | null;
  canExport: boolean;
  onClose: () => void;
  onDownload: (format: "pdf" | "docx") => void;
  onCustomize: () => void;
}) {
  return (
    <Dialog open={Boolean(generation)} onClose={onClose} className="relative z-[80]">
      <DialogBackdrop className="fixed inset-0 bg-[rgba(26,20,16,0.38)] backdrop-blur-sm" />
      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel
            className="w-full max-w-[min(1180px,calc(100vw-32px))] overflow-hidden rounded-[22px] p-5 sm:p-7"
            style={{
              border: `1px solid ${TAILOR_THEME.rule}`,
              background: TAILOR_THEME.paper,
              boxShadow: "0 34px 90px -42px rgba(26,20,16,0.5)",
            }}
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <TailorEyebrow color={TAILOR_THEME.moss}>Tailored resume ready</TailorEyebrow>
                <DialogTitle
                  className="mt-2 font-[var(--font-fraunces)] text-3xl font-semibold tracking-tight"
                  style={{ color: TAILOR_THEME.ink }}
                >
                  Preview your generated resume
                </DialogTitle>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  border: `1px solid ${TAILOR_THEME.rule}`,
                  borderRadius: 999,
                  background: TAILOR_THEME.paperWarm,
                  color: TAILOR_THEME.ink2,
                  cursor: "pointer",
                  height: 36,
                  width: 36,
                }}
              >
                ×
              </button>
            </div>

            <div
              className="aspect-[210/297] max-h-[72vh] w-full overflow-hidden rounded-[14px]"
              style={{
                border: `1px solid ${TAILOR_THEME.rule}`,
                background: "#fff",
                boxShadow: "0 18px 42px -32px rgba(26,20,16,0.28)",
              }}
            >
              {previewUrl ? (
                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  title="Generated tailored resume preview"
                  className="h-full w-full bg-white"
                />
              ) : (
                <div className="grid h-full place-items-center p-6">
                  {templateError ? (
                    <p className="text-center text-sm font-semibold" style={{ color: TAILOR_THEME.ink3 }}>
                      {templateError}
                    </p>
                  ) : (
                    <LoadingOrb
                      label={
                        isLoadingTemplates
                          ? "Loading resume style..."
                          : "Preparing preview..."
                      }
                    />
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              {generation ? (
                <p className="text-xs font-semibold" style={{ color: TAILOR_THEME.ink3 }}>
                  Model: {generation.aiModelUsed}
                </p>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onDownload("pdf")}
                  disabled={!canExport || activeDownload !== null}
                  className="button-primary !px-4 !py-3 !text-sm"
                >
                  {activeDownload === "pdf" ? "Generating..." : "Download PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => onDownload("docx")}
                  disabled={!canExport || activeDownload !== null}
                  className="button-secondary !px-4 !py-3 !text-sm"
                >
                  {activeDownload === "docx" ? "Generating..." : "Download DOCX"}
                </button>
                <button
                  type="button"
                  onClick={onCustomize}
                  className="button-secondary !px-4 !py-3 !text-sm"
                >
                  Edit and customize
                </button>
              </div>
              {activeDownload ? (
                <div className="w-full">
                  <LoadingOrb
                    label={`Generating your ${activeDownload.toUpperCase()} export...`}
                  />
                </div>
              ) : null}
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

export function RetailWorkspace({
  resumes,
  initialResumeId,
  initialGeneration,
  initialTemplate,
  initialOpenDownloadModal = false,
  membershipTier,
}: RetailWorkspaceProps) {
  const router = useRouter();
  const { showErrorToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedResumeId, setSelectedResumeId] = useState(
    initialResumeId && resumes.some((r) => r.id === initialResumeId)
      ? initialResumeId
      : resumes[0]?.id ?? "",
  );
  const [jobDescriptionContent, setJobDescriptionContent] = useState("");
  const [resumeQuery, setResumeQuery] = useState("");
  const [resumeSort, setResumeSort] = useState<"recent" | "name">("recent");
  const [isExtractingJobDescription, setIsExtractingJobDescription] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [templates, setTemplates] = useState<SafeDesignTemplate[]>(
    initialTemplate ? [initialTemplate] : [],
  );
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [hasLoadedTemplates, setHasLoadedTemplates] = useState(Boolean(initialTemplate));
  const [templateError, setTemplateError] = useState(
    initialTemplate ? "" : "No active resume style is available.",
  );
  const [customization, setCustomization] = useState<ResumeCustomization | null>(null);
  const [activeDownload, setActiveDownload] = useState<"pdf" | "docx" | null>(null);
  const [completionModalGeneration, setCompletionModalGeneration] =
    useState<SafeGeneration | null>(
      initialOpenDownloadModal ? initialGeneration ?? null : null,
    );
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editorHtml, setEditorHtml] = useState("");
  const [tailoringStatusLabel, setTailoringStatusLabel] = useState("");
  const [tailoringProgress, setTailoringProgress] = useState(0);
  const [tailoringError, setTailoringError] = useState<string | null>(null);

  // Task-based tailoring state
  const [tailoringTask, setTailoringTask] = useState<SafeBackgroundTask | null>(null);
  const [generatedGeneration, setGeneratedGeneration] = useState<SafeGeneration | null>(
    initialGeneration ?? null,
  );
  const [coverLetterGeneration, setCoverLetterGeneration] = useState<SafeGeneration | null>(null);
  const completionFetchInFlightRef = useRef<string | null>(null);

  const selectedResume = useMemo(
    () => resumes.find((r) => r.id === selectedResumeId) ?? null,
    [resumes, selectedResumeId],
  );
  const filteredResumes = useMemo(() => {
    const query = resumeQuery.trim().toLowerCase();
    return resumes
      .filter((resume) => !query || resume.fileName.toLowerCase().includes(query))
      .sort((a, b) => {
        if (resumeSort === "name") {
          return a.fileName.localeCompare(b.fileName);
        }
        return (
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        );
      });
  }, [resumes, resumeQuery, resumeSort]);

  const hasPremium = hasPremiumAccess(membershipTier);
  const hasResume = Boolean(selectedResumeId);
  const hasJobDescription = jobDescriptionContent.trim().length >= 30;
  const isWaitingForCompletedGeneration =
    tailoringTask?.status === "completed" &&
    Boolean(tailoringTask.resultGenerationId) &&
    !generatedGeneration;
  const isRunning =
    tailoringTask?.status === "pending" ||
    tailoringTask?.status === "running" ||
    tailoringTask?.status === "streaming" ||
    isWaitingForCompletedGeneration;
  const readyToGenerate = hasResume && hasJobDescription && !isSubmitting;
  const firstTemplate = templates[0] ?? null;
  const previewUrl = useMemo(() => {
    if (!generatedGeneration || !firstTemplate || !customization) {
      return "";
    }

    const params = new URLSearchParams({
      generationId: generatedGeneration.id,
      templateId: firstTemplate.id,
      customization: JSON.stringify(customization),
    });

    return `/api/preview?${params.toString()}`;
  }, [customization, firstTemplate, generatedGeneration]);

  // ── Poll for task completion ────────────────────────────────────────────────
  const fetchGeneration = useCallback(async (generationId: string) => {
    try {
      const [genResponse, htmlResponse] = await Promise.all([
        fetch(`/api/generations/${generationId}`, { cache: "no-store" }),
        fetch(`/api/generations/${generationId}/editor-html`, { cache: "no-store" }),
      ]);

      const genPayload = await readApiResponse<GenerationResponse>(
        genResponse,
        "Could not load the tailored resume.",
      );

      if (!genResponse.ok || !genPayload.generation) {
        throw new Error(genPayload.error ?? "Could not load the tailored resume.");
      }

      setGeneratedGeneration(genPayload.generation);
      setCompletionModalGeneration(null);

      if (htmlResponse.ok) {
        const htmlPayload = (await htmlResponse.json()) as { html?: string };
        if (htmlPayload.html) {
          setEditorHtml(htmlPayload.html);
        }
      }

      // Open the CKEditor modal with the completed result.
      setTailoringProgress(100);
      setTailoringStatusLabel("Ready to edit");
      setTailoringError(null);
      setIsEditorModalOpen(true);
      return true;
    } catch (error) {
      console.warn("Could not fetch generation after task completion.", error);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!tailoringTask || !isRunning) return;

    const timer = window.setInterval(() => {
      setTailoringProgress((currentProgress) => {
        const serverProgress = tailoringTask.progressPercent;
        const baseProgress = Math.max(currentProgress, serverProgress);
        const cap = Math.max(serverProgress, getTailoringProgressCap(tailoringTask));

        if (baseProgress >= cap) {
          return baseProgress;
        }

        const nextStep = Math.max(0.6, (cap - baseProgress) * 0.08);
        return Math.min(cap, baseProgress + nextStep);
      });
    }, 700);

    return () => window.clearInterval(timer);
  }, [isRunning, tailoringTask]);

  useEffect(() => {
    const handleOpenTask = (event: Event) => {
      const taskId =
        event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail.taskId === "string"
          ? event.detail.taskId
          : "";

      if (!taskId || taskId !== tailoringTask?.id) return;

      setIsEditorModalOpen(true);
    };

    window.addEventListener("resume-tailoring:open-task", handleOpenTask);
    return () => window.removeEventListener("resume-tailoring:open-task", handleOpenTask);
  }, [tailoringTask?.id]);

  // Poll task status every second until completed or failed
  useEffect(() => {
    if (!tailoringTask || !isRunning) return;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/tasks/${tailoringTask.id}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { task?: SafeBackgroundTask };
        const updated = payload.task;
        if (!updated) return;

        setTailoringTask(updated);
        setTailoringStatusLabel(updated.stageLabel);
        setTailoringProgress((current) => Math.max(current, updated.progressPercent));

        if (updated.status === "completed" && updated.resultGenerationId) {
          if (completionFetchInFlightRef.current === updated.resultGenerationId) {
            return;
          }

          completionFetchInFlightRef.current = updated.resultGenerationId;
          const generationLoaded = await fetchGeneration(updated.resultGenerationId);
          completionFetchInFlightRef.current = null;

          if (generationLoaded) {
            window.clearInterval(timer);
            notifyGeminiRouterRefresh();
          } else {
            setTailoringStatusLabel("Tailored resume saved. Loading editor...");
          }
        } else if (updated.status === "failed" || updated.status === "canceled") {
          window.clearInterval(timer);
          notifyGeminiRouterRefresh();
          if (updated.status === "failed") {
            const msg = updated.error ?? "Tailoring failed.";
            setTailoringError(msg);
            showErrorToast(msg, { title: "Tailoring couldn't finish" });
          }
        }
      } catch {
        // ignore transient errors — keep polling
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [tailoringTask, isRunning, fetchGeneration, showErrorToast]);

  useEffect(() => {
    if (!generatedGeneration || templates.length || isLoadingTemplates || hasLoadedTemplates) return;

    let ignore = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setIsLoadingTemplates(true);
    setTemplateError("");

    fetch("/api/templates", { cache: "no-store", signal: controller.signal })
      .then((response) =>
        readApiResponse<TemplatesResponse>(
          response,
          "Could not load the resume style.",
        ),
      )
      .then((payload) => {
        if (ignore) return;
        const nextTemplates = (payload.templates ?? []).slice(0, 1);
        setTemplates(nextTemplates);
        if (!nextTemplates.length) {
          setTemplateError("No active resume style is available.");
        }
      })
      .catch((error) => {
        if (ignore) return;
        setTemplateError(
          error instanceof Error && error.name !== "AbortError"
            ? error.message
            : "Could not load the resume style. Open the edit page to try again.",
        );
      })
      .finally(() => {
        if (!ignore) {
          window.clearTimeout(timeout);
          setHasLoadedTemplates(true);
          setIsLoadingTemplates(false);
        }
      });

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [generatedGeneration, hasLoadedTemplates, isLoadingTemplates, templates.length]);

  useEffect(() => {
    if (!generatedGeneration || !firstTemplate) return;

    setCustomization((currentCustomization) =>
      normalizeResumeCustomization(
        currentCustomization ?? generatedGeneration.customization,
        firstTemplate.config,
      ),
    );
  }, [firstTemplate, generatedGeneration]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleJobDescriptionTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setJobDescriptionContent(e.target.value);
  };

  const handleJobDescriptionFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsExtractingJobDescription(true);
    try {
      const response = await fetch("/api/job-description/extract", {
        method: "POST",
        headers: buildBinaryUploadHeaders(file),
        body: file,
      });
      const payload = await readApiResponse<ExtractJobDescriptionResponse>(
        response,
        "The server returned an unexpected response while extracting the job description.",
      );
      if (!response.ok || !payload.content) {
        throw new Error(payload.error ?? "We couldn't extract text from that file.");
      }
      setJobDescriptionContent(payload.content);
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "We couldn't extract text from that file.",
        { title: "Job description extraction couldn't finish" },
      );
    } finally {
      setIsExtractingJobDescription(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedResumeId) {
      showErrorToast("Please choose a resume first.", { title: "Tailoring couldn't start" });
      return;
    }
    if (!hasJobDescription) {
      showErrorToast("Please provide a fuller job description first.", {
        title: "Tailoring couldn't start",
      });
      return;
    }

    setIsSubmitting(true);
    setTailoringTask(null);
    setGeneratedGeneration(null);
    setCompletionModalGeneration(null);
    setEditorHtml("");
    setTailoringProgress(0);
    setTailoringStatusLabel("Queuing tailoring...");
    setTailoringError(null);
    completionFetchInFlightRef.current = null;
    // NOTE: modal is NOT opened here — it opens only when the task completes.

    const clientTaskId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimisticTask = createOptimisticTailoringTask({
      clientTaskId,
      resumeFileName: selectedResume?.fileName ?? "Selected resume",
    });
    window.dispatchEvent(
      new CustomEvent("task-queue:highlight", {
        detail: { action: "upsert", task: optimisticTask },
      }),
    );

    try {
      const response = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: selectedResumeId,
          jobDescription: jobDescriptionContent.trim(),
          clientTaskId,
        }),
      });

      const payload = await readApiResponse<TailorTaskResponse>(
        response,
        "The server returned an unexpected response.",
      );

      if (!response.ok) {
        if (payload.task) {
          window.dispatchEvent(
            new CustomEvent("task-queue:highlight", {
              detail: { action: "upsert", task: payload.task },
            }),
          );
        }
        throw new Error(payload.error ?? "We couldn't queue the tailoring task.");
      }

      if (!payload.task) {
        throw new Error(payload.error ?? "We couldn't queue the tailoring task.");
      }

      setTailoringTask(payload.task);
      setTailoringStatusLabel(payload.task.stageLabel);
      setTailoringProgress(payload.task.progressPercent);
      setTailoringError(null);

      // Open the task queue panel and insert the new task immediately. The
      // panel still reconciles with the server, but the user should not have
      // to wait for a manual refresh to see the queued tailoring run.
      window.dispatchEvent(
        new CustomEvent("task-queue:highlight", {
          detail: { action: "upsert", task: payload.task },
        }),
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("task-queue:highlight", {
          detail: { action: "remove", taskId: optimisticTask.id },
        }),
      );
      showErrorToast(
        error instanceof Error ? error.message : "We couldn't start tailoring.",
        { title: "Tailoring couldn't start" },
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelTailoringGeneration = async () => {
    if (!tailoringTask) return;

    try {
      const response = await fetch(`/api/tasks/${tailoringTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const payload = await readApiResponse<{ error?: string; task?: SafeBackgroundTask }>(
        response,
        "We couldn't cancel the tailoring task.",
      );

      if (!response.ok || !payload.task) {
        throw new Error(payload.error ?? "We couldn't cancel the tailoring task.");
      }

      setTailoringTask(payload.task);
      setTailoringStatusLabel("Canceled");
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "We couldn't cancel the tailoring task.",
        { title: "Cancel failed" },
      );
    }
  };

  const handleGenerateExport = async (format: "pdf" | "docx") => {
    if (!generatedGeneration || !firstTemplate || !customization) {
      showErrorToast("The tailored resume preview is still loading.", {
        title: "Design export couldn't start",
      });
      return;
    }

    setActiveDownload(format);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId: generatedGeneration.id,
          templateId: firstTemplate.id,
          customization,
        }),
      });

      const payload = await readApiResponse<GenerateFilesResponse>(
        response,
        "We couldn't generate the download files.",
      );

      if (!response.ok) {
        throw new Error(payload.error ?? "We couldn't generate the download files.");
      }

      if (payload.generation) {
        setGeneratedGeneration(payload.generation);
      }

      const targetUrl =
        format === "pdf"
          ? payload.generation?.generatedFiles.pdfUrl ?? payload.pdfUrl
          : payload.generation?.generatedFiles.docxUrl ?? payload.docxUrl;

      if (targetUrl) {
        triggerDownload(targetUrl, `${firstTemplate.slug}-${generatedGeneration.id}.${format}`);
      }
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "We couldn't generate the download files.",
        { title: "Design export couldn't finish" },
      );
    } finally {
      setActiveDownload(null);
    }
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!resumes.length) {
    return (
      <section
        className="m-6 p-8 text-center sm:m-8"
        style={{
          border: `1px solid ${TAILOR_THEME.rule}`,
          borderRadius: 18,
          background: TAILOR_THEME.paper,
        }}
      >
        <TailorEyebrow>Retailing</TailorEyebrow>
        <h1 className="mt-3 font-[var(--font-fraunces)] text-4xl font-semibold tracking-tight">
          Upload a resume before tailoring
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7" style={{ color: TAILOR_THEME.ink3 }}>
          This flow starts from at least one analyzed resume. Add a resume from your profile
          first, then come back here to tailor it to a job description.
        </p>
        <Link href="/profile" className="button-primary mt-6">
          Go to Profile
        </Link>
      </section>
    );
  }

  // ── Main workspace ───────────────────────────────────────────────────────────
  return (
    <div
      className="space-y-6 px-6 pb-8 pt-6 sm:px-8 sm:pb-10"
      style={{
        background: TAILOR_THEME.paper,
        color: TAILOR_THEME.ink,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={handleJobDescriptionFileChange}
      />

      <section
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <TailorStepCard
          index={1}
          kicker="Step one"
          title="Pick your base resume"
          status={hasResume ? "done" : "active"}
        >
          <div
            style={{
              overflow: "hidden",
              border: `1px solid ${TAILOR_THEME.rule}`,
              borderRadius: 14,
              background: TAILOR_THEME.paper,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                padding: 12,
                borderBottom: `1px solid ${TAILOR_THEME.ruleSoft}`,
                background: TAILOR_THEME.paperWarm,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: `1px solid ${TAILOR_THEME.rule}`,
                  borderRadius: 10,
                  background: TAILOR_THEME.paper,
                  padding: "0 14px",
                }}
              >
                <span style={{ color: TAILOR_THEME.ink4, fontSize: 14 }}>⌕</span>
                <input
                  value={resumeQuery}
                  onChange={(event) => setResumeQuery(event.target.value)}
                  placeholder="Search by file name"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    padding: "10px 0",
                    fontSize: 13.5,
                    color: TAILOR_THEME.ink,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: `1px solid ${TAILOR_THEME.rule}`,
                  borderRadius: 10,
                  background: TAILOR_THEME.paper,
                  padding: 4,
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                {[
                  ["recent", "Recent"],
                  ["name", "A-Z"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setResumeSort(key as "recent" | "name")}
                    style={{
                      border: "none",
                      borderRadius: 6,
                      background: resumeSort === key ? TAILOR_THEME.ink : "transparent",
                      color: resumeSort === key ? TAILOR_THEME.paper : TAILOR_THEME.ink3,
                      cursor: "pointer",
                      font: "inherit",
                      padding: "8px 12px",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {filteredResumes.length ? (
                filteredResumes.map((resume, index) => {
                  const selected = resume.id === selectedResumeId;
                  return (
                    <button
                      key={resume.id}
                      type="button"
                      onClick={() => setSelectedResumeId(resume.id)}
                      style={{
                        display: "grid",
                        width: "100%",
                        gridTemplateColumns: "auto minmax(0, 1fr) auto",
                        alignItems: "center",
                        gap: 16,
                        border: "none",
                        borderTop:
                          index === 0 ? "none" : `1px solid ${TAILOR_THEME.ruleSoft}`,
                        background: selected ? TAILOR_THEME.amberWash : "transparent",
                        cursor: "pointer",
                        padding: "14px 18px",
                        textAlign: "left",
                      }}
                    >
                      <FileGlyph selected={selected} />
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: TAILOR_THEME.ink,
                            fontSize: 14,
                            fontWeight: 700,
                            letterSpacing: "-0.005em",
                          }}
                        >
                          {resume.fileName}
                        </span>
                        <span
                          style={{
                            display: "block",
                            marginTop: 2,
                            color: TAILOR_THEME.ink3,
                            fontSize: 12,
                          }}
                        >
                          {resume.createdAt
                            ? `Uploaded ${dateFormatter.format(new Date(resume.createdAt))}`
                            : "Uploaded recently"}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          display: "grid",
                          width: 18,
                          height: 18,
                          placeItems: "center",
                          border: `1.5px solid ${selected ? TAILOR_THEME.amber : TAILOR_THEME.rule}`,
                          borderRadius: "50%",
                          background: selected ? TAILOR_THEME.amber : TAILOR_THEME.paper,
                        }}
                      >
                        {selected ? (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#fff",
                            }}
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: TAILOR_THEME.ink3,
                    fontFamily: "var(--font-fraunces), Georgia, serif",
                    fontSize: 15,
                    fontStyle: "italic",
                  }}
                >
                  no resumes match &quot;{resumeQuery}&quot;
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                borderTop: `1px solid ${TAILOR_THEME.ruleSoft}`,
                background: TAILOR_THEME.paperWarm,
                padding: "10px 16px",
              }}
            >
              <TailorEyebrow>
                {filteredResumes.length} of {resumes.length} resumes
              </TailorEyebrow>
              {selectedResume ? (
                <TailorEyebrow color={TAILOR_THEME.ink2}>
                  Selected: {selectedResume.fileName}
                </TailorEyebrow>
              ) : null}
            </div>
          </div>
        </TailorStepCard>

        <TailorStepCard
          index={2}
          kicker="Step two"
          title="Add the job description"
          status={!hasResume ? "pending" : hasJobDescription ? "done" : "active"}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TailorEyebrow>Paste or upload</TailorEyebrow>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isExtractingJobDescription}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  border: `1px solid ${TAILOR_THEME.rule}`,
                  borderRadius: 999,
                  background: TAILOR_THEME.paper,
                  color: TAILOR_THEME.ink2,
                  cursor: isExtractingJobDescription ? "not-allowed" : "pointer",
                  fontSize: 12.5,
                  fontWeight: 700,
                  opacity: isExtractingJobDescription ? 0.62 : 1,
                  padding: "7px 14px",
                }}
              >
                {isExtractingJobDescription ? "Extracting…" : "Upload TXT file"}
              </button>
            </div>
          </div>

          {isExtractingJobDescription ? (
            <div className="mt-4">
              <LoadingOrb label="Reading the uploaded job description…" />
            </div>
          ) : null}

          <label className="mt-4 block">
            <span className="sr-only">Job description text</span>
            <div
              style={{
                border: `1px solid ${TAILOR_THEME.rule}`,
                borderRadius: 14,
                background: TAILOR_THEME.paper,
                padding: 2,
              }}
            >
              <textarea
                value={jobDescriptionContent}
                onChange={handleJobDescriptionTextChange}
                rows={12}
                placeholder="Paste the role description here. Include responsibilities, requirements, and any nice-to-haves."
                style={{
                  width: "100%",
                  minHeight: 220,
                  resize: "vertical",
                  border: "none",
                  borderRadius: 12,
                  outline: "none",
                  background: "transparent",
                  color: TAILOR_THEME.ink,
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  padding: "20px 22px",
                }}
              />
            </div>
          </label>

          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-3"
            style={{
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: TAILOR_THEME.ink3,
            }}
          >
            <span>
              {jobDescriptionContent.length === 0
                ? "No content yet"
                : `${jobDescriptionContent.length.toLocaleString()} characters`}
            </span>
            {jobDescriptionContent.trim().length > 0 &&
            jobDescriptionContent.trim().length < 30 ? (
              <span style={{ color: TAILOR_THEME.amber }}>
                Add a bit more detail so the tailoring can work well.
              </span>
            ) : (
              <span style={{ color: TAILOR_THEME.ink4 }}>
                Tip: include the company section if you have it
              </span>
            )}
          </div>
        </TailorStepCard>

        <TailorStepCard
          index={3}
          kicker="Step three"
          title="Generate the tailored resume"
          status={generatedGeneration ? "done" : readyToGenerate || isRunning ? "active" : "pending"}
        >
          <div
            className="grid gap-6 sm:grid-cols-3"
            style={{
              borderBottom: `1px solid ${TAILOR_THEME.ruleSoft}`,
              padding: "20px 0 28px",
            }}
          >
            <div>
              <TailorEyebrow>Resume</TailorEyebrow>
              <p
                className="mt-2 truncate text-sm font-semibold"
                style={{ color: hasResume ? TAILOR_THEME.ink : TAILOR_THEME.ink4 }}
              >
                {selectedResume?.fileName ?? "Not selected"}
              </p>
            </div>
            <div>
              <TailorEyebrow>Job description</TailorEyebrow>
              <p className="mt-2 text-sm font-semibold" style={{ color: TAILOR_THEME.ink }}>
                {hasJobDescription ? `${getWordCount(jobDescriptionContent)} words` : "Not provided"}
              </p>
            </div>
            <div>
              <TailorEyebrow>Membership</TailorEyebrow>
              <p className="mt-2 text-sm font-semibold" style={{ color: TAILOR_THEME.ink }}>
                {hasPremium ? "Premium" : "Free"}
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!readyToGenerate}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                border: "none",
                borderRadius: 999,
                background: readyToGenerate ? TAILOR_THEME.amber : TAILOR_THEME.paperDeep,
                boxShadow: readyToGenerate
                  ? "0 1px 0 rgba(255,255,255,0.25) inset, 0 6px 18px rgba(168,72,14,0.18)"
                  : "none",
                color: readyToGenerate ? "#fff" : TAILOR_THEME.ink4,
                cursor: readyToGenerate ? "pointer" : "not-allowed",
                fontSize: 14.5,
                fontWeight: 700,
                padding: "14px 28px",
              }}
            >
              {isSubmitting
                ? "Queuing..."
                : isRunning
                  ? "Queue another tailored resume"
                  : "Tailor this resume"}
              <span aria-hidden="true">→</span>
            </button>

            {generatedGeneration && !isRunning && (
              <button
                type="button"
                onClick={() => setIsEditorModalOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1.5px solid ${TAILOR_THEME.moss}`,
                  borderRadius: 999,
                  background: "transparent",
                  color: TAILOR_THEME.moss,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "13px 24px",
                }}
              >
                <span aria-hidden="true">✎</span> Edit tailored resume
              </button>
            )}

            {!hasResume && (
              <p className="text-sm italic" style={{ color: TAILOR_THEME.ink3 }}>
                select a resume above first
              </p>
            )}
            {hasResume && !hasJobDescription && (
              <p className="text-sm italic" style={{ color: TAILOR_THEME.ink3 }}>
                add a job description above to begin
              </p>
            )}
          </div>

          {generatedGeneration && !isRunning ? (
            <div
              className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[10px] p-4 text-sm"
              style={{
                background: "rgba(89,106,64,0.08)",
                border: `1px solid ${TAILOR_THEME.moss}`,
                color: TAILOR_THEME.moss,
              }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 18 }}>✓</span>
                <div>
                  <span className="font-bold">Tailoring complete.</span>
                  <span style={{ color: TAILOR_THEME.ink3, marginLeft: 6 }}>
                    Model: {generatedGeneration.aiModelUsed}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorModalOpen(true)}
                style={{
                  border: `1px solid ${TAILOR_THEME.moss}`,
                  borderRadius: 999,
                  background: TAILOR_THEME.moss,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 700,
                  padding: "7px 16px",
                }}
              >
                Open editor →
              </button>
            </div>
          ) : (
            <div
              className="mt-8 flex items-center gap-3 rounded-[10px] p-4 text-sm"
              style={{
                background: TAILOR_THEME.paperWarm,
                color: TAILOR_THEME.ink2,
              }}
            >
              <TailorEyebrow>FYI</TailorEyebrow>
              <span>
                This run will be saved to <strong style={{ color: TAILOR_THEME.ink }}>History</strong>.
                You can re-tailor anytime.
              </span>
            </div>
          )}

        </TailorStepCard>
      </section>

      <TailoredResumeEditorModal
        open={isEditorModalOpen}
        task={tailoringTask}
        generation={generatedGeneration}
        statusLabel={tailoringStatusLabel}
        progress={tailoringProgress}
        editorHtml={editorHtml}
        sections={[]}
        isStreaming={false}
        error={tailoringError}
        onClose={() => setIsEditorModalOpen(false)}
        onCancelGeneration={() => void handleCancelTailoringGeneration()}
        onEditorHtmlChange={setEditorHtml}
        onGenerationSaved={(generation) => setGeneratedGeneration(generation)}
        onOpenEditPage={(generationId) => router.push(`/tailor/editor/${generationId}`)}
      />

      <TailorCompletionModal
        generation={completionModalGeneration}
        previewUrl={previewUrl}
        templateError={templateError}
        isLoadingTemplates={isLoadingTemplates}
        activeDownload={activeDownload}
        canExport={Boolean(firstTemplate && customization)}
        onClose={() => setCompletionModalGeneration(null)}
        onDownload={(format) => void handleGenerateExport(format)}
        onCustomize={() => {
          if (!completionModalGeneration) return;
          setCompletionModalGeneration(null);
          router.push(`/tailor/editor/${completionModalGeneration.id}`);
        }}
      />

      <CoverLetterModal
        generation={coverLetterGeneration}
        membershipTier={membershipTier}
        onClose={() => setCoverLetterGeneration(null)}
      />
    </div>
  );
}
