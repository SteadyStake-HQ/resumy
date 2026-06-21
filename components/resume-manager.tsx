"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { BuniMascot } from "@/components/profile/buni-mascot";
import { LoadingOrb } from "@/components/ui/loading-orb";
import { StatusBanner } from "@/components/ui/status-banner";
import { useToast } from "@/components/ui/toast-provider";
import {
  notifyGeminiRouterRefresh,
  readApiResponse,
  RESUME_VAULT_REFRESH_EVENT,
  type ResumeVaultRefreshDetail,
} from "@/lib/client-api";
import { buildBinaryUploadHeaders } from "@/lib/file-upload";
import type { SafeBackgroundTask } from "@/lib/background-task";
import { PROFILE_THEME as PROF } from "@/lib/profile-theme";
import type { SafeResume } from "@/lib/resume";
import {
  confirmAllResumesRemoval,
  confirmResumeRemoval,
} from "@/lib/sweet-alert";

const AnalysisReportModal = dynamic(
  async () =>
    (await import("@/components/analysis-report-modal")).AnalysisReportModal,
  { ssr: false },
);

type ResumeManagerProps = {
  initialResumes: SafeResume[];
};

type UploadResponse = {
  error?: string;
  task?: SafeBackgroundTask;
};

type DeleteResumeResponse = {
  error?: string;
  success?: boolean;
  deletedCount?: number;
};

type PendingVaultUpdate = ResumeVaultRefreshDetail;

type ResumeDropZoneProps = {
  hasResumes: boolean;
  isDraggingFile: boolean;
  isUploading: boolean;
  onFileDrop: (file: File) => Promise<void>;
  onOpenFilePicker: () => void;
  onSetDraggingFile: (isDragging: boolean) => void;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const ACCEPTED_RESUME_EXTENSIONS = [".pdf", ".docx"];

function UploadArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function ReportSparkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="M5 18h14" />
      <path d="M7 15.5 10 11l3 2.5 4-6" />
      <path d="M17 7h2v2" />
    </svg>
  );
}

function DeleteStackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M8 7V5h8v2" />
      <path d="M7 7l1 12h8l1-12" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function AIPencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="M4 20l4.6-1.1L19 8.5 15.5 5 5.1 15.4 4 20Z" />
      <path d="M13.8 6.7l3.5 3.5" />
      <path
        d="m18.2 13.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function SectionLabel({
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

function PillActionButton({
  children,
  onClick,
  disabled,
  tone = "ghost",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "ghost" | "action" | "danger";
  type?: "button" | "submit";
}) {
  const styles =
    tone === "action"
      ? {
          background: `linear-gradient(135deg, ${PROF.actionBg}, #D6F0E3)`,
          border: `1.5px solid ${PROF.actionEdge}`,
          color: PROF.actionInk,
        }
      : tone === "danger"
        ? {
            background: PROF.dangerBg,
            border: `1.5px solid ${PROF.dangerEdge}`,
            color: PROF.dangerInk,
          }
        : {
            background: PROF.surface,
            border: `1.5px solid ${PROF.line}`,
            color: PROF.ink,
          };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        padding: "9px 14px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        ...styles,
      }}
    >
      {children}
    </button>
  );
}

function getResumeExtensionLabel(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension === "DOCX" ? "DOCX" : "PDF";
}

function hasDraggedFiles(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function createOptimisticUploadTask(file: File): SafeBackgroundTask {
  const now = new Date().toISOString();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: `optimistic-${id}`,
    type: "resume_analysis",
    status: "uploading",
    title: "Resume analysis",
    fileName: file.name,
    stageKey: "uploading",
    stageLabel: "Uploading resume",
    progressPercent: 3,
    error: null,
    resultResumeId: null,
    resultGenerationId: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    events: [
      {
        label: "Uploading resume",
        tone: "info",
        createdAt: now,
      },
    ],
    debugData: { clientTaskId: `optimistic-${id}` },
    canDismiss: false,
    canRetry: false,
    canCancel: false,
  };
}

function dispatchQueueTask(task: SafeBackgroundTask) {
  window.dispatchEvent(
    new CustomEvent("task-queue:highlight", {
      detail: { action: "upsert", task },
    }),
  );
}

function removeQueueTask(taskId: string) {
  window.dispatchEvent(
    new CustomEvent("task-queue:highlight", {
      detail: { action: "remove", taskId },
    }),
  );
}

function getResumeVaultRefreshDetail(event: Event): PendingVaultUpdate | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail = event.detail as Partial<ResumeVaultRefreshDetail> | undefined;

  if (!detail || typeof detail.resumeId !== "string" || !detail.resumeId.trim()) {
    return null;
  }

  return {
    fileName: typeof detail.fileName === "string" ? detail.fileName : null,
    resumeId: detail.resumeId,
    taskId: typeof detail.taskId === "string" ? detail.taskId : undefined,
  };
}

function ResumeDropZone({
  hasResumes,
  isDraggingFile,
  isUploading,
  onFileDrop,
  onOpenFilePicker,
  onSetDraggingFile,
}: ResumeDropZoneProps) {
  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    onSetDraggingFile(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    onSetDraggingFile(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    const nextTarget = event.relatedTarget as Node | null;

    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }

    onSetDraggingFile(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSetDraggingFile(false);

    const [file] = Array.from(event.dataTransfer.files ?? []);

    if (!file) {
      return;
    }

    await onFileDrop(file);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onOpenFilePicker();
  };

  return (
    <div
      role="button"
      tabIndex={isUploading ? -1 : 0}
      onClick={isUploading ? undefined : onOpenFilePicker}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-dragging={isDraggingFile}
      aria-disabled={isUploading}
      aria-label="Choose a resume file to upload"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: hasResumes ? "28px 24px" : "36px 24px",
        background: isDraggingFile
          ? `linear-gradient(135deg, ${PROF.accent}22, ${PROF.accent2}22)`
          : PROF.surfaceSoft,
        border: `1.8px dashed ${isDraggingFile ? PROF.accent : PROF.line}`,
        borderRadius: 18,
        cursor: isUploading ? "not-allowed" : "pointer",
        transition: "all 0.18s",
        transform: isDraggingFile ? "scale(1.01)" : "scale(1)",
        outline: "none",
        opacity: isUploading ? 0.65 : 1,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: `linear-gradient(135deg, ${PROF.accent2}, ${PROF.accent})`,
          display: "grid",
          placeItems: "center",
          color: "#fff",
          boxShadow: `0 6px 16px -6px ${PROF.accent}99`,
        }}
      >
        <UploadArrowIcon />
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: PROF.ink, letterSpacing: -0.1 }}>
        {hasResumes ? "Drop one more resume here" : "Drop or choose a resume"}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 11.5,
          color: PROF.inkSoft,
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
        }}
      >
        PDF or DOCX supported, one file at a time
      </p>
    </div>
  );
}

export function ResumeManager({ initialResumes }: ResumeManagerProps) {
  const router = useRouter();
  const { showErrorToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resumes, setResumes] = useState(initialResumes);
  const [selectedResume, setSelectedResume] = useState<SafeResume | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null);
  const [isDeletingAllResumes, setIsDeletingAllResumes] = useState(false);
  const [pendingVaultUpdate, setPendingVaultUpdate] =
    useState<PendingVaultUpdate | null>(null);
  const isVaultUpdating = Boolean(pendingVaultUpdate);

  const openFilePicker = () => fileInputRef.current?.click();

  useEffect(() => {
    setResumes(initialResumes);
    setSelectedResume((currentResume) =>
      currentResume
        ? initialResumes.find((resume) => resume.id === currentResume.id) ?? null
        : null,
    );
  }, [initialResumes]);

  useEffect(() => {
    const handleVaultRefresh = (event: Event) => {
      const detail = getResumeVaultRefreshDetail(event);

      if (!detail) {
        return;
      }

      setPendingVaultUpdate(detail);
    };

    window.addEventListener(RESUME_VAULT_REFRESH_EVENT, handleVaultRefresh);

    return () => {
      window.removeEventListener(RESUME_VAULT_REFRESH_EVENT, handleVaultRefresh);
    };
  }, []);

  useEffect(() => {
    if (!pendingVaultUpdate) {
      return;
    }

    const hasLoadedResume = initialResumes.some(
      (resume) => resume.id === pendingVaultUpdate.resumeId,
    );

    if (!hasLoadedResume) {
      return;
    }

    setPendingVaultUpdate(null);
    setMessage({
      tone: "success",
      text: `${pendingVaultUpdate.fileName ?? "Resume"} is ready in your vault.`,
    });
  }, [initialResumes, pendingVaultUpdate]);

  useEffect(() => {
    if (!pendingVaultUpdate) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPendingVaultUpdate((currentUpdate) =>
        currentUpdate?.resumeId === pendingVaultUpdate.resumeId
          ? null
          : currentUpdate,
      );
    }, 30_000);

    return () => window.clearTimeout(timeout);
  }, [pendingVaultUpdate]);

  useEffect(() => {
    const preventFileDropNavigation = (event: globalThis.DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("dragover", preventFileDropNavigation);
    window.addEventListener("drop", preventFileDropNavigation);

    return () => {
      window.removeEventListener("dragover", preventFileDropNavigation);
      window.removeEventListener("drop", preventFileDropNavigation);
    };
  }, []);

  const isResumeFile = (file: File) => {
    const fileName = file.name.toLowerCase();

    return ACCEPTED_RESUME_EXTENSIONS.some((extension) =>
      fileName.endsWith(extension),
    );
  };

  const uploadResumeFile = async (file: File, clientTaskId: string) => {
    if (!isResumeFile(file)) {
      throw new Error(`${file.name} is not a PDF or DOCX resume.`);
    }

    const response = await fetch("/api/resume/upload", {
      method: "POST",
      headers: buildBinaryUploadHeaders(file, clientTaskId),
      body: file,
    });

    const payload = await readApiResponse<UploadResponse>(
      response,
      "Upload failed.",
    );

    if (!response.ok) {
      if (payload.task) {
        dispatchQueueTask(payload.task);
      }
      throw new Error(payload.error ?? `${file.name}: Upload failed.`);
    }

    if (!payload.task) {
      throw new Error(payload.error ?? `${file.name}: Upload failed.`);
    }

    return payload.task;
  };

  const uploadSelectedResume = async (file: File) => {
    const optimisticTask = createOptimisticUploadTask(file);

    setIsUploading(true);
    setMessage(null);
    dispatchQueueTask(optimisticTask);

    try {
      const queuedTask = await uploadResumeFile(file, optimisticTask.id);
      dispatchQueueTask(queuedTask);
      setMessage({
        tone: "success",
        text: `${file.name} is running in the background queue.`,
      });
    } catch (error) {
      removeQueueTask(optimisticTask.id);
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed.";
      showErrorToast(errorMessage, { title: "Upload failed" });
    } finally {
      setIsUploading(false);
      notifyGeminiRouterRefresh();
    }
  };

  const handleDeleteResume = async (resume: SafeResume) => {
    const shouldDelete = await confirmResumeRemoval(resume.fileName);
    if (!shouldDelete) return;

    setDeletingResumeId(resume.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/resume/${resume.id}`, {
        method: "DELETE",
      });

      const payload = await readApiResponse<DeleteResumeResponse>(
        response,
        "Remove failed.",
      );

      // 404 means the resume no longer exists in the database (already deleted
      // by another tab, a concurrent action, or a stale client state). Treat
      // this as a successful removal so the UI stays consistent.
      const alreadyGone = response.status === 404;

      if (!alreadyGone && (!response.ok || !payload.success)) {
        throw new Error(payload.error ?? "Remove failed.");
      }

      setResumes((cur) => cur.filter((r) => r.id !== resume.id));
      setSelectedResume((cur) => (cur?.id === resume.id ? null : cur));
      setMessage({ tone: "success", text: `${resume.fileName} removed.` });
      router.refresh();
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Remove failed.",
        { title: "Remove failed" },
      );
    } finally {
      setDeletingResumeId(null);
    }
  };

  const handleDeleteAllResumes = async () => {
    if (!resumes.length) {
      return;
    }

    const shouldDelete = await confirmAllResumesRemoval(resumes.length);
    if (!shouldDelete) return;

    setIsDeletingAllResumes(true);
    setMessage(null);

    try {
      const response = await fetch("/api/resume", {
        method: "DELETE",
      });

      const payload = await readApiResponse<DeleteResumeResponse>(
        response,
        "Remove failed.",
      );

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Remove failed.");
      }

      setResumes([]);
      setSelectedResume(null);
      setMessage({
        tone: "success",
        text:
          payload.deletedCount && payload.deletedCount > 0
            ? `${payload.deletedCount} resumes removed.`
            : "All resumes removed.",
      });
      router.refresh();
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Remove failed.",
        { title: "Remove failed" },
      );
    } finally {
      setIsDeletingAllResumes(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!file) return;

    await uploadSelectedResume(file);
  };

  return (
    <>
      <section
        style={{
          padding: "32px 40px 40px",
          background: PROF.surface,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <SectionLabel>03 — resume vault</SectionLabel>
            <div
              style={{
                marginTop: 6,
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: -0.8,
                color: PROF.ink,
                lineHeight: 1.05,
                fontFamily: 'var(--font-kaisei-tokumin), serif',
              }}
            >
              your resume toolbox ★
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: PROF.inkSoft }}>
              every resume Buni has read. neatly stacked and ready.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
            <PillActionButton onClick={openFilePicker} disabled={isUploading} tone="action">
              <UploadArrowIcon />
              {isUploading ? "Uploading..." : "Upload resume"}
            </PillActionButton>
            {resumes.length ? (
              <PillActionButton
                onClick={() => void handleDeleteAllResumes()}
                disabled={isDeletingAllResumes}
                tone="danger"
              >
                <DeleteStackIcon />
                {isDeletingAllResumes ? "Removing..." : "Delete all"}
              </PillActionButton>
            ) : null}
          </div>
        </div>

        {message?.tone === "success" ? (
          <div style={{ marginTop: 16 }}>
            <StatusBanner tone="success">
              {message.text}
            </StatusBanner>
          </div>
        ) : null}

        {isUploading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              marginTop: 16,
              background: `linear-gradient(90deg, ${PROF.actionBg}, ${PROF.completedBg})`,
              border: `1.5px solid ${PROF.actionEdge}`,
              borderRadius: 14,
              color: PROF.actionInk,
              flexWrap: "wrap",
            }}
          >
            <LoadingOrb label="Uploading resume" />
            <div style={{ minWidth: 220, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>
                Uploading your resume into the background queue.
              </p>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 11.5,
                  color: PROF.inkSoft,
                  fontFamily: 'var(--font-ibm-plex-mono), monospace',
                }}
              >
                The task queue will track extraction progress.
              </p>
            </div>
          </div>
        ) : null}

        {isVaultUpdating ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              marginTop: 16,
              background: `linear-gradient(90deg, ${PROF.surfaceSoft}, ${PROF.completedBg})`,
              border: `1.5px solid ${PROF.completedEdge}`,
              borderRadius: 14,
              color: PROF.completedInk,
              flexWrap: "wrap",
            }}
          >
            <LoadingOrb label="Updating resume vault" />
            <div style={{ minWidth: 220, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>
                Pulling the completed resume into your vault.
              </p>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 11.5,
                  color: PROF.inkSoft,
                  fontFamily: 'var(--font-ibm-plex-mono), monospace',
                }}
              >
                {pendingVaultUpdate?.fileName ?? "New resume"} will appear here in a moment.
              </p>
            </div>
          </div>
        ) : null}

        <div
          style={{
            marginTop: 16,
          }}
        >
          <ResumeDropZone
            hasResumes={resumes.length > 0}
            isDraggingFile={isDraggingFile}
            isUploading={isUploading}
            onFileDrop={uploadSelectedResume}
            onOpenFilePicker={openFilePicker}
            onSetDraggingFile={setIsDraggingFile}
          />
        </div>

        {resumes.length > 0 ? (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {resumes.map((resume) => (
              <article
                key={resume.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  background: PROF.surface,
                  border: `1.5px solid ${PROF.line}`,
                  borderRadius: 14,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 54,
                    borderRadius: 8,
                    background: `linear-gradient(135deg, ${PROF.surfaceSoft}, ${PROF.bg})`,
                    border: `1.5px solid ${PROF.line}`,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: 0.8,
                      color: PROF.accent,
                      fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    }}
                  >
                    {getResumeExtensionLabel(resume.fileName)}
                  </div>
                  <div style={{ position: "absolute", top: -6, right: -6, fontSize: 12 }}>
                    ✦
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h3
                      style={{
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 14.5,
                        fontWeight: 700,
                        color: PROF.ink,
                        letterSpacing: -0.1,
                        margin: 0,
                      }}
                    >
                      {resume.fileName}
                    </h3>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.8,
                        color: PROF.actionInk,
                        background: PROF.actionBg,
                        border: `1px solid ${PROF.actionEdge}`,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      ATS {resume.analysisReport.score}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: 11.5,
                      color: PROF.inkSoft,
                      fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    }}
                  >
                    Added{" "}
                    {resume.createdAt
                      ? dateFormatter.format(new Date(resume.createdAt))
                      : "recently"}
                  </p>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
                  <PillActionButton onClick={() => setSelectedResume(resume)}>
                    <ReportSparkIcon />
                    Report
                  </PillActionButton>
                  <Link
                    href={`/retail?resumeId=${resume.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 12px",
                      background: `linear-gradient(135deg, ${PROF.actionBg}, #D6F0E3)`,
                      border: `1.5px solid ${PROF.actionEdge}`,
                      borderRadius: 999,
                      color: PROF.actionInk,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Tailor
                    <AIPencilIcon />
                  </Link>
                  <PillActionButton
                    onClick={() => handleDeleteResume(resume)}
                    disabled={deletingResumeId === resume.id}
                    tone="danger"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.9"
                      aria-hidden="true"
                      width="14"
                      height="14"
                    >
                      <path d="M4 7h16" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M6 7l1 14h10l1-14" />
                      <path d="M9 7V4h6v3" />
                    </svg>
                    {deletingResumeId === resume.id ? "Removing..." : "Delete"}
                  </PillActionButton>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              padding: "26px 20px",
              borderRadius: 18,
              border: `1.5px solid ${PROF.line}`,
              background: `linear-gradient(180deg, ${PROF.surfaceSoft}, ${PROF.surface})`,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                margin: "0 auto",
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,0.85)",
                border: `1.5px solid ${PROF.line}`,
              }}
            >
              <BuniMascot size={72} mood="idle" />
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 16,
                fontWeight: 700,
                color: PROF.ink,
                fontFamily: 'var(--font-kaisei-tokumin), serif',
              }}
            >
              nothing in the vault yet
            </div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: PROF.inkSoft }}>
              Upload one resume and Buni will keep it ready for reports and tailoring.
            </div>
          </div>
        )}
      </section>

      <AnalysisReportModal
        resume={selectedResume}
        onClose={() => setSelectedResume(null)}
      />
    </>
  );
}
