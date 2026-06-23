import { Types } from "@/lib/id";
import { normalizeAIUsage, type AIUsage } from "@/lib/ai-usage";

export const TASK_TYPES = ["resume_analysis", "resume_tailoring"] as const;
export const TASK_STATUSES = [
  "uploading",
  "pending",
  "running",
  "streaming",
  "completed",
  "failed",
  "canceled",
] as const;

export type BackgroundTaskType = (typeof TASK_TYPES)[number];
export type BackgroundTaskStatus = (typeof TASK_STATUSES)[number];

export type BackgroundTaskEventTone = "info" | "success" | "error";

export type BackgroundTaskEvent = {
  label: string;
  tone: BackgroundTaskEventTone;
  createdAt: string | null;
};

export type SafeBackgroundTask = {
  id: string;
  type: BackgroundTaskType;
  status: BackgroundTaskStatus;
  title: string;
  fileName: string;
  stageKey: string;
  stageLabel: string;
  progressPercent: number;
  error: string | null;
  resultResumeId: string | null;
  resultGenerationId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  events: BackgroundTaskEvent[];
  debugData: Record<string, unknown> | null;
  aiUsage: AIUsage | null;
  canDismiss: boolean;
  canRetry: boolean;
  canCancel: boolean;
};

type BackgroundTaskLike = {
  _id: Types.ObjectId | string;
  type?: unknown;
  status?: unknown;
  title?: unknown;
  fileName?: unknown;
  stageKey?: unknown;
  stageLabel?: unknown;
  progressPercent?: unknown;
  error?: unknown;
  resultResumeId?: Types.ObjectId | string | null;
  resultGenerationId?: Types.ObjectId | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  events?: unknown;
  debugData?: unknown;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStatus(value: unknown): BackgroundTaskStatus {
  const normalizedValue = normalizeString(value) as BackgroundTaskStatus;

  return TASK_STATUSES.includes(normalizedValue) ? normalizedValue : "pending";
}

function normalizeType(value: unknown): BackgroundTaskType {
  const normalizedValue = normalizeString(value) as BackgroundTaskType;

  return TASK_TYPES.includes(normalizedValue) ? normalizedValue : "resume_analysis";
}

function normalizeProgressPercent(value: unknown) {
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(normalizeString(value));

  if (Number.isNaN(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function normalizeTaskEvents(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const label = normalizeString(record.label);

      if (!label) {
        return null;
      }

      const tone = normalizeString(record.tone);

      return {
        label,
        tone:
          tone === "success" || tone === "error" ? tone : "info",
        createdAt: normalizeDate(record.createdAt),
      } satisfies BackgroundTaskEvent;
    })
    .filter((entry): entry is BackgroundTaskEvent => Boolean(entry))
    .slice(-24);
}

function toNullableId(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  return normalizeString(value) || null;
}

export function toSafeBackgroundTask(task: BackgroundTaskLike): SafeBackgroundTask {
  const status = normalizeStatus(task.status);
  const debugData =
    task.debugData && typeof task.debugData === "object" && !Array.isArray(task.debugData)
      ? (task.debugData as Record<string, unknown>)
      : null;
  const aiUsage = normalizeAIUsage(debugData?.aiUsage);

  return {
    id: task._id.toString(),
    type: normalizeType(task.type),
    status,
    title: normalizeString(task.title) || "Background task",
    fileName: normalizeString(task.fileName),
    stageKey: normalizeString(task.stageKey) || "queued",
    stageLabel: normalizeString(task.stageLabel) || "Queued",
    progressPercent: normalizeProgressPercent(task.progressPercent),
    error: normalizeString(task.error) || null,
    resultResumeId: toNullableId(task.resultResumeId),
    resultGenerationId: toNullableId(task.resultGenerationId),
    createdAt: normalizeDate(task.createdAt),
    updatedAt: normalizeDate(task.updatedAt),
    startedAt: normalizeDate(task.startedAt),
    completedAt: normalizeDate(task.completedAt),
    events: normalizeTaskEvents(task.events),
    debugData,
    aiUsage,
    canDismiss: status === "completed" || status === "failed" || status === "canceled",
    canRetry: status === "failed",
    canCancel:
      status === "pending" ||
      status === "running" ||
      status === "streaming",
  };
}
