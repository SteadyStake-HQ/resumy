"use client";

import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BuniMascot } from "@/components/profile/buni-mascot";
import type { SafeBackgroundTask } from "@/lib/background-task";
import { formatAIUsageCost } from "@/lib/ai-usage";
import { notifyResumeVaultRefresh } from "@/lib/client-api";
import { PROFILE_THEME as PROF } from "@/lib/profile-theme";
import { useToast } from "@/components/ui/toast-provider";
import {
  confirmAllTaskCancellation,
  confirmTaskCancellation,
  confirmTaskQueueClear,
} from "@/lib/sweet-alert";

type TaskListResponse = {
  tasks?: SafeBackgroundTask[];
  error?: string;
};

type TaskResponse = {
  task?: SafeBackgroundTask;
  error?: string;
};

type TaskQueueLoadStatus = "loading" | "loaded" | "unauthorized" | "error";

const TASK_LIST_POLL_TIMEOUT_MS = 8_000;
const TASK_DETAIL_POLL_TIMEOUT_MS = 8_000;

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error &&
    /aborted|abort/i.test(error.message)
  );
}

async function fetchJsonWithTimeout<T>(
  url: string,
  options: { timeoutMs?: number; timeoutMessage?: string } = {},
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? TASK_DETAIL_POLL_TIMEOUT_MS,
  );

  try {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T;
    return { response, payload };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        options.timeoutMessage ?? "Task queue request timed out. Retrying...",
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

const KAWAII = {
  bg: PROF.bg,
  surface: PROF.surface,
  surfaceSoft: PROF.surfaceSoft,
  ink: PROF.ink,
  inkSoft: PROF.inkSoft,
  inkMute: PROF.inkMute,
  line: PROF.line,
  running: {
    bg: "#EAF4FF",
    cardBg: "linear-gradient(135deg, #EAF4FF 0%, #F5FBFF 56%, #FFFFFF 100%)",
    edge: "#8FC7F2",
    ink: "#0B5F8A",
    dot: "#1687C4",
  },
  uploading: {
    bg: "#F3ECFF",
    cardBg: "linear-gradient(135deg, #F3ECFF 0%, #FAF7FF 58%, #FFFFFF 100%)",
    edge: "#D8C5FF",
    ink: "#6E4BA8",
    dot: "#8C63D7",
  },
  pending: {
    bg: "#FFF4D8",
    cardBg: "linear-gradient(135deg, #FFF4D8 0%, #FFF9E9 58%, #FFFFFF 100%)",
    edge: "#E7BD4D",
    ink: "#8A5D05",
    dot: "#C58A12",
  },
  failed: {
    bg: "#FFECEF",
    cardBg: "linear-gradient(135deg, #FFECEF 0%, #FFF6F7 58%, #FFFFFF 100%)",
    edge: "#F29AAA",
    ink: "#A01836",
    dot: "#D9304F",
  },
  completed: {
    bg: "#EAF8EE",
    cardBg: "linear-gradient(135deg, #EAF8EE 0%, #F5FCF7 58%, #FFFFFF 100%)",
    edge: "#8DCEA0",
    ink: "#176533",
    dot: "#2E9D50",
  },
  canceled: {
    bg: "#F4EFE6",
    cardBg: "linear-gradient(135deg, #F4EFE6 0%, #FBF8F2 58%, #FFFFFF 100%)",
    edge: "#D9C9AA",
    ink: "#7A6442",
    dot: "#A88955",
  },
  accent: PROF.accent,
  accent2: PROF.accent2,
  accent3: PROF.accent3,
};

function formatTaskTime(value: string | null) {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function getTaskDateValue(task: SafeBackgroundTask) {
  return task.createdAt ?? task.startedAt ?? task.completedAt;
}

function getTaskDayKey(task: SafeBackgroundTask) {
  const value = getTaskDateValue(task);
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatTaskDayLabel(dayKey: string) {
  if (dayKey === "unknown") {
    return "Unknown date";
  }

  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, "0"),
    String(yesterday.getDate()).padStart(2, "0"),
  ].join("-");

  if (dayKey === todayKey) {
    return "Today";
  }
  if (dayKey === yesterdayKey) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

function taskMatchesSearch(task: SafeBackgroundTask, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [
    task.title,
    task.fileName,
    task.status,
    task.stageLabel,
    task.type.replace(/_/g, " "),
    getTaskResultLabel(task),
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function getStatusTheme(status: SafeBackgroundTask["status"]) {
  switch (status) {
    case "uploading":
      return KAWAII.uploading;
    case "running":
    case "streaming":
      return KAWAII.running;
    case "completed":
      return KAWAII.completed;
    case "failed":
      return KAWAII.failed;
    case "canceled":
      return KAWAII.canceled;
    default:
      return KAWAII.pending;
  }
}

function getTaskTypeTheme(type: SafeBackgroundTask["type"]) {
  if (type === "resume_tailoring") {
    return {
      bg: "linear-gradient(135deg, #F6F0FF 0%, #EEF7FF 54%, #FFFDF8 100%)",
      edge: "#CDBBFF",
      stripe: "#8C63D7",
      glow: "rgba(140, 99, 215, 0.14)",
    };
  }

  return {
    bg: "linear-gradient(135deg, #FFF8EA 0%, #F8FFFA 58%, #FFFFFF 100%)",
    edge: "#EACB82",
    stripe: "#C59025",
    glow: "rgba(197, 144, 37, 0.12)",
  };
}

function getTaskCardBackground(statusTheme: ReturnType<typeof getStatusTheme>) {
  return statusTheme.cardBg ?? statusTheme.bg;
}

function getTaskDisplayStatus(task: SafeBackgroundTask): SafeBackgroundTask["status"] {
  if (task.stageKey === "uploading") {
    return "uploading";
  }

  if (task.stageKey === "starting") {
    return "running";
  }

  return task.status;
}

function getTaskDisplayTitle(task: SafeBackgroundTask) {
  return task.fileName || task.title;
}

function getTaskAgentLabel(task: SafeBackgroundTask) {
  return task.type.replace(/_/g, "-");
}

function getElapsedLabel(task: SafeBackgroundTask, now: number) {
  const start = task.startedAt ? new Date(task.startedAt).getTime() : null;
  const end = task.completedAt ? new Date(task.completedAt).getTime() : now;
  const base =
    start ?? (task.createdAt ? new Date(task.createdAt).getTime() : null);

  if (!base || Number.isNaN(base)) {
    return "0s";
  }

  const seconds = Math.max(0, Math.floor((end - base) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function getTaskResultLabel(task: SafeBackgroundTask) {
  if (task.type === "resume_tailoring") {
    return task.resultGenerationId ? "Tailored resume ready" : task.stageLabel;
  }
  if (task.resultResumeId) {
    return "Resume analysis ready";
  }
  return task.stageLabel;
}

function formatTokenCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1000) return `${Math.round(value)}`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
}

function isOptimisticQueueTask(task: SafeBackgroundTask) {
  return task.id.startsWith("optimistic-");
}

function isActiveQueueTask(task: SafeBackgroundTask) {
  const displayStatus = getTaskDisplayStatus(task);
  return (
    displayStatus === "uploading" ||
    displayStatus === "pending" ||
    displayStatus === "running" ||
    displayStatus === "streaming"
  );
}

function isTerminalQueueTask(task: SafeBackgroundTask) {
  return (
    task.status === "completed" ||
    task.status === "failed" ||
    task.status === "canceled"
  );
}

function getTaskStableKey(task: SafeBackgroundTask) {
  const clientTaskId = task.debugData?.clientTaskId;
  return typeof clientTaskId === "string" && clientTaskId ? clientTaskId : task.id;
}

function getTaskIdentityKeys(task: SafeBackgroundTask) {
  return new Set([task.id, getTaskStableKey(task)].filter(Boolean));
}

function taskMatchesIdentity(task: SafeBackgroundTask, identityKeys: Set<string>) {
  return Array.from(getTaskIdentityKeys(task)).some((key) => identityKeys.has(key));
}

function getTaskFreshnessValue(task: SafeBackgroundTask) {
  const timestamps = [
    task.updatedAt,
    task.completedAt,
    task.startedAt,
    task.events.at(-1)?.createdAt,
    task.createdAt,
  ];

  for (const value of timestamps) {
    if (!value) {
      continue;
    }

    const timestamp = new Date(value).getTime();

    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

function chooseFreshestTask(
  currentTask: SafeBackgroundTask | undefined,
  nextTask: SafeBackgroundTask,
) {
  if (!currentTask || isOptimisticQueueTask(currentTask)) {
    return nextTask;
  }

  if (isOptimisticQueueTask(nextTask)) {
    return currentTask;
  }

  if (isTerminalQueueTask(nextTask) && !isTerminalQueueTask(currentTask)) {
    return nextTask;
  }

  if (isTerminalQueueTask(currentTask) && !isTerminalQueueTask(nextTask)) {
    return currentTask;
  }

  const currentFreshness = getTaskFreshnessValue(currentTask);
  const nextFreshness = getTaskFreshnessValue(nextTask);

  if (nextFreshness > currentFreshness) {
    return nextTask;
  }

  if (nextFreshness < currentFreshness) {
    return currentTask;
  }

  if (nextTask.events.length > currentTask.events.length) {
    return nextTask;
  }

  if (nextTask.progressPercent > currentTask.progressPercent) {
    return nextTask;
  }

  if (nextTask.status !== currentTask.status) {
    return nextTask;
  }

  return nextTask.stageLabel !== currentTask.stageLabel ? nextTask : currentTask;
}

function mergeServerTasksWithOptimisticTasks(
  serverTasks: SafeBackgroundTask[],
  currentTasks: SafeBackgroundTask[],
) {
  const serverKeys = new Set(
    serverTasks.flatMap((task) => Array.from(getTaskIdentityKeys(task))),
  );
  const terminalServerTaskKeys = new Set(
    serverTasks
      .filter(isTerminalQueueTask)
      .map((task) => `${task.type}:${task.fileName.trim().toLowerCase()}`),
  );
  const retainedActiveTasks = currentTasks.filter(
    (task) =>
      isActiveQueueTask(task) &&
      !taskMatchesIdentity(task, serverKeys) &&
      !terminalServerTaskKeys.has(`${task.type}:${task.fileName.trim().toLowerCase()}`),
  );
  const mergedServerTasks = serverTasks.map((serverTask) => {
    const serverIdentityKeys = getTaskIdentityKeys(serverTask);
    const currentTask = currentTasks.find((task) =>
      taskMatchesIdentity(task, serverIdentityKeys),
    );

    return chooseFreshestTask(currentTask, serverTask);
  });

  return [...retainedActiveTasks, ...mergedServerTasks];
}

function upsertTaskByStableKey(
  tasks: SafeBackgroundTask[],
  nextTask: SafeBackgroundTask,
) {
  const nextIdentityKeys = getTaskIdentityKeys(nextTask);
  let didReplace = false;
  const nextTasks = tasks.reduce<SafeBackgroundTask[]>((accumulator, task) => {
    if (!taskMatchesIdentity(task, nextIdentityKeys)) {
      accumulator.push(task);
      return accumulator;
    }

    if (!didReplace) {
      accumulator.push(chooseFreshestTask(task, nextTask));
      didReplace = true;
    }

    return accumulator;
  }, []);

  return didReplace ? nextTasks : [nextTask, ...nextTasks];
}

type QueueMutationDetail =
  | { action: "upsert"; task: SafeBackgroundTask }
  | { action: "remove"; taskId: string };

function detailLooksLikeQueueMutation(value: unknown): value is QueueMutationDetail {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.action === "remove") {
    return typeof record.taskId === "string" && record.taskId.length > 0;
  }

  if (record.action !== "upsert") {
    return false;
  }

  const task = record.task;

  return Boolean(
    task &&
      typeof task === "object" &&
      !Array.isArray(task) &&
      typeof (task as Record<string, unknown>).id === "string" &&
      typeof (task as Record<string, unknown>).status === "string",
  );
}

function getTailoringPipelineDebug(task: SafeBackgroundTask | null) {
  const debugData = task?.debugData;

  if (!debugData || typeof debugData !== "object" || Array.isArray(debugData)) {
    return null;
  }

  const pipeline = debugData.tailoringPipeline;

  return pipeline && typeof pipeline === "object" && !Array.isArray(pipeline)
    ? (pipeline as Record<string, unknown>)
    : null;
}

function DebugJsonPanel({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle?: string;
  value: unknown;
}) {
  return (
    <div
      style={{
        background: KAWAII.surface,
        border: `1.5px solid ${KAWAII.line}`,
        borderRadius: 18,
        padding: "14px 14px 12px",
        boxShadow: `0 2px 0 ${KAWAII.line}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: KAWAII.ink }}>
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: KAWAII.inkSoft,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
          {subtitle}
        </div>
      ) : null}
      <pre
        style={{
          marginTop: 10,
          maxHeight: 220,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          borderRadius: 14,
          background: "rgba(255,255,255,0.76)",
          border: `1px solid ${KAWAII.line}`,
          padding: 12,
          fontSize: 11,
          lineHeight: 1.55,
          color: KAWAII.ink,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        }}
      >
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}

function getTaskMood(tasks: SafeBackgroundTask[]) {
  if (tasks.some((task) => task.status === "failed")) {
    return "sad" as const;
  }

  if (
    tasks.some(
      (task) =>
        task.status === "uploading" ||
        task.status === "running" ||
        task.status === "streaming",
    )
  ) {
    return "working" as const;
  }

  if (tasks.some((task) => task.status === "completed")) {
    return "happy" as const;
  }

  return "idle" as const;
}

function Mascot({
  size = 56,
  mood = "idle",
}: {
  size?: number;
  mood?: "idle" | "working" | "happy" | "sad";
}) {
  return <BuniMascot size={size} mood={mood} />;
}

function StatusIcon({
  status,
  size = 22,
}: {
  status: SafeBackgroundTask["status"];
  size?: number;
}) {
  const theme = getStatusTheme(status);
  const common = {
    width: size,
    height: size,
    borderRadius: 999,
    background: theme.bg,
    border: `1.5px solid ${theme.edge}`,
    display: "grid",
    placeItems: "center",
  } as const;

  if (status === "uploading" || status === "running" || status === "streaming") {
    return (
      <div style={{ ...common, boxShadow: `0 0 0 3px ${theme.bg}55` }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: theme.dot,
            boxShadow: `0 0 0 3px ${theme.dot}33`,
            animation: "taskQueueKawaiiPulse 1.3s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div style={common}>
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="9" stroke={theme.ink} strokeWidth="2.2" />
          <path
            d="M12 7 V12 L15.5 14"
            stroke={theme.ink}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (status === "failed" || status === "canceled") {
    return (
      <div style={common}>
        <svg
          width={size * 0.55}
          height={size * 0.55}
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M7 7 L17 17 M17 7 L7 17"
            stroke={theme.ink}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div style={common}>
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M5 12.5 L10 17 L19 7.5"
          stroke={theme.ink}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function notifyCompletedResumeTask(task: SafeBackgroundTask) {
  if (!task.resultResumeId) {
    return;
  }

  notifyResumeVaultRefresh({
    fileName: task.fileName,
    resumeId: task.resultResumeId,
    taskId: task.id,
  });
}

function handleCompletedTaskSideEffects(
  task: SafeBackgroundTask,
  router: ReturnType<typeof useRouter>,
) {
  if (task.resultResumeId) {
    notifyCompletedResumeTask(task);
  }

  if (task.resultResumeId || task.resultGenerationId) {
    router.refresh();
  }
}

function CountChip({
  status,
  count,
  label,
}: {
  status: SafeBackgroundTask["status"];
  count: number;
  label: string;
}) {
  const theme = getStatusTheme(status);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 8px 4px 5px",
        borderRadius: 999,
        background: theme.bg,
        border: `1px solid ${theme.edge}`,
        color: theme.ink,
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      <StatusIcon status={status} size={14} />
      <span>{count}</span>
      <span style={{ opacity: 0.72, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function ProgressBar({
  value,
  color,
  edge,
}: {
  value: number;
  color: string;
  edge: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: 8,
        borderRadius: 999,
        background: `${edge}55`,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          width: `${Math.max(4, Math.min(100, value))}%`,
          height: "100%",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          transition: "width 0.4s cubic-bezier(.4,1.4,.5,1)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
            animation: "taskQueueKawaiiShimmer 1.6s linear infinite",
          }}
        />
      </div>
    </div>
  );
}

function shouldSmoothProgress(status: SafeBackgroundTask["status"]) {
  return status === "running" || status === "streaming";
}

function normalizeProgressValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function useVisibleTaskProgress(
  task: SafeBackgroundTask,
  displayStatus: SafeBackgroundTask["status"],
) {
  const targetProgress = normalizeProgressValue(task.progressPercent);
  const smoothProgress = shouldSmoothProgress(displayStatus);
  const previousTargetRef = useRef(targetProgress);
  const [visibleProgress, setVisibleProgress] = useState(targetProgress);

  useEffect(() => {
    const previousTarget = previousTargetRef.current;
    previousTargetRef.current = targetProgress;
    const catchUpTimer = window.setTimeout(() => {
      if (!smoothProgress) {
        setVisibleProgress(targetProgress);
        return;
      }

      setVisibleProgress((currentProgress) => {
        if (targetProgress < currentProgress) {
          return targetProgress;
        }

        if (targetProgress > previousTarget && currentProgress < previousTarget) {
          return previousTarget;
        }

        return currentProgress;
      });
    }, 0);

    return () => window.clearTimeout(catchUpTimer);
  }, [smoothProgress, targetProgress]);

  useEffect(() => {
    if (!smoothProgress) {
      return;
    }

    const timer = window.setInterval(() => {
      setVisibleProgress((currentProgress) => {
        if (currentProgress >= targetProgress) {
          return currentProgress;
        }

        return Math.min(targetProgress, currentProgress + 1);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [smoothProgress, targetProgress]);

  return smoothProgress ? visibleProgress : targetProgress;
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        width: 24,
        height: 24,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
        opacity: disabled ? 0.45 : 1,
      }}
      className="task-queue-kawaii-icon-btn"
    >
      {children}
    </button>
  );
}

function FooterButton({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone?: "failed";
}) {
  const danger = tone === "failed";
  const border = danger ? KAWAII.failed.edge : KAWAII.line;
  const color = danger ? KAWAII.failed.ink : KAWAII.ink;
  const background = disabled ? KAWAII.surfaceSoft : KAWAII.surface;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        border: `1.5px solid ${disabled ? KAWAII.line : border}`,
        background,
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        color: disabled ? KAWAII.inkMute : color,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
      className="task-queue-kawaii-footer-btn"
    >
      {icon}
      {label}
    </button>
  );
}

function MiniBadge({
  status,
  count,
}: {
  status: SafeBackgroundTask["status"];
  count: number;
}) {
  const theme = getStatusTheme(status);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "3px 7px",
        background: theme.bg,
        border: `1px solid ${theme.edge}`,
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        color: theme.ink,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: theme.dot,
          animation:
            status === "uploading" || status === "running" || status === "streaming"
              ? "taskQueueKawaiiPulse 1.3s ease-in-out infinite"
              : "none",
        }}
      />
      {count}
    </div>
  );
}

function TaskRow({
  task,
  now,
  isQueueBusy,
  onOpenDetails,
  onCancel,
  onRemove,
}: {
  task: SafeBackgroundTask;
  now: number;
  isQueueBusy: boolean;
  onOpenDetails: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const displayStatus = getTaskDisplayStatus(task);
  const theme = getStatusTheme(displayStatus);
  const typeTheme = getTaskTypeTheme(task.type);
  const visibleProgressPercent = useVisibleTaskProgress(task, displayStatus);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails();
        }
      }}
      style={{
        background: getTaskCardBackground(theme),
        border: `1.5px solid ${theme.edge}`,
        borderRadius: 16,
        padding: "12px 12px 12px 14px",
        boxShadow: `0 2px 0 ${theme.edge}, 0 10px 24px ${typeTheme.glow}`,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        minHeight: "max-content",
      }}
      className={`task-queue-kawaii-row ${
        displayStatus === "pending" ? "task-queue-kawaii-row--queued" : ""
      } ${
        displayStatus === "uploading" ||
        displayStatus === "running" ||
        displayStatus === "streaming"
          ? "task-queue-kawaii-row--active"
          : ""
      }`}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ paddingTop: 2 }}>
              <StatusIcon status={displayStatus} size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: theme.ink,
                  background: theme.bg,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${theme.edge}`,
                  flexShrink: 0,
                }}
              >
                {displayStatus}
              </span>
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: KAWAII.ink,
                  lineHeight: 1.4,
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                }}
              >
                {getTaskDisplayTitle(task)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {task.canCancel ? (
                <IconButton
                  title="Cancel"
                  onClick={onCancel}
                  disabled={isQueueBusy}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="7"
                      y="7"
                      width="10"
                      height="10"
                      rx="2"
                      fill={KAWAII.inkSoft}
                    />
                  </svg>
                </IconButton>
              ) : null}
              {task.canDismiss ? (
                <IconButton
                  title="Dismiss"
                  onClick={onRemove}
                  disabled={isQueueBusy}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 6 L18 18 M18 6 L6 18"
                      stroke={KAWAII.inkSoft}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </IconButton>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              fontSize: 11,
              color: KAWAII.inkSoft,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              minWidth: 0,
              flexWrap: "wrap",
              whiteSpace: "normal",
              rowGap: 4,
            }}
          >
            <span style={{ flexShrink: 0 }}>{getTaskAgentLabel(task)}</span>
            <span style={{ opacity: 0.5, flexShrink: 0 }}>·</span>
            <span style={{ flexShrink: 0 }}>{getElapsedLabel(task, now)}</span>
            <span style={{ opacity: 0.5, flexShrink: 0 }}>·</span>
            <span
              style={{
                color: theme.ink,
                minWidth: 0,
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
              {task.stageLabel}
            </span>
          </div>

          {displayStatus === "uploading" ||
          displayStatus === "pending" ||
          displayStatus === "running" ||
          displayStatus === "streaming" ? (
            <div style={{ marginTop: 10 }}>
              <ProgressBar
                value={
                  displayStatus === "uploading" || displayStatus === "pending"
                    ? Math.max(4, task.progressPercent)
                    : visibleProgressPercent
                }
                color={theme.dot}
                edge={theme.edge}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  fontSize: 10.5,
                  color: KAWAII.inkSoft,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                }}
              >
                <span>
                  {displayStatus === "uploading"
                    ? task.stageLabel || "uploading..."
                    : displayStatus === "pending"
                    ? task.stageLabel || "queued…"
                    : task.events.at(-1)?.label || "processing…"}
                </span>
                <span style={{ color: theme.ink, fontWeight: 600 }}>
                  {displayStatus === "uploading"
                    ? "uploading"
                    : displayStatus === "pending"
                    ? "queued"
                    : `${Math.round(visibleProgressPercent)}%`}
                </span>
              </div>
            </div>
          ) : null}

          {task.status === "failed" && task.error ? (
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 10,
                background: theme.bg,
                border: `1px dashed ${theme.edge}`,
                fontSize: 11.5,
                color: theme.ink,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              ⚠ {task.error}
            </div>
          ) : null}

          {task.status === "completed" && (task.resultResumeId || task.resultGenerationId) ? (
            <div
              style={{
                marginTop: 8,
                padding: "7px 10px",
                borderRadius: 10,
                background: theme.bg,
                border: `1px solid ${theme.edge}`,
                fontSize: 11.5,
                color: theme.ink,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 12 }}>✨</span>
              <span>{getTaskResultLabel(task)}</span>
            </div>
          ) : null}

          {task.aiUsage && task.aiUsage.totalTokens > 0 ? (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 6,
                fontSize: 10.5,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                color: KAWAII.inkSoft,
              }}
            >
              <span
                title={`${task.aiUsage.inputTokens.toLocaleString()} in · ${task.aiUsage.outputTokens.toLocaleString()} out · ${task.aiUsage.calls} call${task.aiUsage.calls === 1 ? "" : "s"}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: theme.bg,
                  border: `1px solid ${theme.edge}`,
                }}
              >
                <span style={{ opacity: 0.7 }}>⛁</span>
                {formatTokenCount(task.aiUsage.totalTokens)} tokens
              </span>
              <span
                title="Estimated cost of this run"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: theme.bg,
                  border: `1px solid ${theme.edge}`,
                  color: theme.ink,
                  fontWeight: 600,
                }}
              >
                {formatAIUsageCost(task.aiUsage.estimatedCostUsd)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskDetailsModal({
  task,
  now,
  isQueueBusy,
  onClose,
  onRetry,
  onCancel,
  onDismiss,
  onOpenProfile,
  onOpenDesignStudio,
  onOpenDownloadModal,
  onOpenTailoringModal,
}: {
  task: SafeBackgroundTask | null;
  now: number;
  isQueueBusy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onOpenProfile: () => void;
  onOpenDesignStudio: (generationId: string) => void;
  onOpenDownloadModal: (generationId: string) => void;
  onOpenTailoringModal: (taskId: string) => void;
}) {
  if (!task) {
    return null;
  }

  const theme = getStatusTheme(task.status);
  const tailoringDebug = getTailoringPipelineDebug(task);

  return (
    <Dialog open={Boolean(task)} onClose={onClose} className="relative z-[70]">
      <DialogBackdrop className="fixed inset-0 bg-[rgba(59,46,78,0.34)] backdrop-blur-md" />

      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel
            style={{
              width: "100%",
              maxWidth: 760,
              borderRadius: 28,
              background: `linear-gradient(180deg, ${KAWAII.surfaceSoft} 0%, ${KAWAII.bg} 100%)`,
              boxShadow: "0 28px 70px -34px rgba(114,84,164,0.48)",
              border: `1.5px solid ${KAWAII.line}`,
              color: KAWAII.ink,
              overflow: "hidden",
            }}
          >
            <div
              style={{ padding: "22px 22px 18px 22px", position: "relative" }}
            >
              <svg
                style={{
                  position: "absolute",
                  top: -38,
                  right: -30,
                  opacity: 0.45,
                  pointerEvents: "none",
                }}
                width="180"
                height="180"
                viewBox="0 0 180 180"
              >
                <circle cx="100" cy="80" r="60" fill="#F5D9EE" />
                <circle cx="140" cy="40" r="22" fill="#E4EDFF" />
              </svg>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <Mascot
                      size={40}
                      mood={
                        task.status === "failed"
                          ? "sad"
                          : task.status === "completed"
                            ? "happy"
                            : task.status === "uploading" ||
                                task.status === "running" ||
                                task.status === "streaming"
                              ? "working"
                              : "idle"
                      }
                    />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>
                        Task details
                      </div>
                      <div style={{ fontSize: 11.5, color: KAWAII.inkSoft }}>
                        {formatTaskTime(task.createdAt) || "Queued just now"}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 20,
                      fontWeight: 800,
                      letterSpacing: -0.3,
                    }}
                  >
                    {getTaskDisplayTitle(task)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 10,
                      fontSize: 11,
                      color: KAWAII.inkSoft,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    }}
                  >
                    <span>{getTaskAgentLabel(task)}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>{getElapsedLabel(task, now)}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span style={{ color: theme.ink }}>{task.stageLabel}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    border: `1.5px solid ${KAWAII.line}`,
                    background: KAWAII.surface,
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    color: KAWAII.inkSoft,
                    flexShrink: 0,
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{ width: 16, height: 16 }}
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

            </div>

            <div style={{ padding: "16px 22px 18px 22px" }}>
              {task.status === "uploading" ||
              task.status === "running" ||
              task.status === "streaming" ? (
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar
                    value={task.progressPercent}
                    color={theme.dot}
                    edge={theme.edge}
                  />
                </div>
              ) : null}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <CountChip status={task.status} count={1} label={task.status} />
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      borderRadius: 999,
                      background: "#F3EBFF",
                      border: `1.5px solid ${KAWAII.line}`,
                      color: KAWAII.accent,
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    }}
                  >
                    {task.progressPercent}%
                  </div>
                  {task.aiUsage && task.aiUsage.totalTokens > 0 ? (
                    <>
                      <div
                        title={`${task.aiUsage.inputTokens.toLocaleString()} input · ${task.aiUsage.outputTokens.toLocaleString()} output · ${task.aiUsage.calls} AI call${task.aiUsage.calls === 1 ? "" : "s"}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 12px",
                          borderRadius: 999,
                          background: KAWAII.surface,
                          border: `1.5px solid ${KAWAII.line}`,
                          color: KAWAII.ink,
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        }}
                      >
                        <span style={{ opacity: 0.7 }}>⛁</span>
                        {formatTokenCount(task.aiUsage.totalTokens)} tokens
                      </div>
                      <div
                        title="Estimated cost of this run"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 12px",
                          borderRadius: 999,
                          background: KAWAII.surface,
                          border: `1.5px solid ${KAWAII.line}`,
                          color: KAWAII.accent,
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        }}
                      >
                        {formatAIUsageCost(task.aiUsage.estimatedCostUsd)}
                      </div>
                    </>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                {task.type === "resume_tailoring" &&
                (task.status === "pending" ||
                  task.status === "running" ||
                  task.status === "streaming") ? (
                  <FooterButton
                    icon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14" stroke={KAWAII.running.ink} strokeWidth="2.2" strokeLinecap="round" />
                        <path d="m13 6 6 6-6 6" stroke={KAWAII.running.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    }
                    label="Open editor"
                    onClick={() => onOpenTailoringModal(task.id)}
                    disabled={isQueueBusy}
                  />
                ) : task.resultGenerationId ? (
                  <>
                    <FooterButton
                      icon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M12 4v10" stroke={KAWAII.completed.ink} strokeWidth="2.2" strokeLinecap="round" />
                          <path d="m8 10 4 4 4-4" stroke={KAWAII.completed.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M5 19h14" stroke={KAWAII.completed.ink} strokeWidth="2.2" strokeLinecap="round" />
                        </svg>
                      }
                      label="Download"
                      onClick={() => onOpenDownloadModal(task.resultGenerationId!)}
                      disabled={isQueueBusy}
                    />
                    <FooterButton
                      icon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12.5 L10 17 L19 7.5" stroke={KAWAII.completed.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      }
                      label="Edit tailored resume"
                      onClick={() => onOpenDesignStudio(task.resultGenerationId!)}
                      disabled={isQueueBusy}
                    />
                  </>
                ) : task.resultResumeId ? (
                  <FooterButton
                    icon={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M5 12.5 L10 17 L19 7.5"
                          stroke={KAWAII.completed.ink}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    }
                    label="Open profile"
                    onClick={onOpenProfile}
                    disabled={isQueueBusy}
                  />
                ) : null}
                {task.canRetry ? (
                  <FooterButton
                    icon={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M4 12 a8 8 0 1 1 3 6.2"
                          stroke={KAWAII.inkSoft}
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          fill="none"
                        />
                        <path
                          d="M3 18 L 3 13 L 8 13"
                          stroke={KAWAII.inkSoft}
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    }
                    label="Retry"
                    onClick={onRetry}
                    disabled={isQueueBusy}
                  />
                ) : null}
                {task.canCancel ? (
                  <FooterButton
                    icon={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <rect
                          x="7"
                          y="7"
                          width="10"
                          height="10"
                          rx="2"
                          fill={KAWAII.failed.ink}
                        />
                      </svg>
                    }
                    label="Cancel"
                    onClick={onCancel}
                    disabled={isQueueBusy}
                    tone="failed"
                  />
                ) : null}
                {task.canDismiss ? (
                  <FooterButton
                    icon={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M6 6 L18 18 M18 6 L6 18"
                          stroke={KAWAII.inkSoft}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    }
                    label="Delete history"
                    onClick={onDismiss}
                    disabled={isQueueBusy}
                  />
                ) : null}
                </div>
              </div>

              {task.error ? (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: KAWAII.failed.bg,
                    border: `1px dashed ${KAWAII.failed.edge}`,
                    color: KAWAII.failed.ink,
                    fontSize: 12,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  ⚠ {task.error}
                </div>
              ) : null}

              {tailoringDebug ? (
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: 1.6,
                      textTransform: "uppercase",
                      color: KAWAII.accent,
                    }}
                  >
                    Tailoring Debug
                  </div>
                  <DebugJsonPanel
                    title="1. Job Description Analysis"
                    subtitle={`Provider: ${String(tailoringDebug.provider ?? "selected AI")}`}
                    value={tailoringDebug.jobDescriptionAnalysis}
                  />
                  <DebugJsonPanel
                    title="2. Original Resume Context"
                    subtitle="Full selected resume context passed into tailoring"
                    value={tailoringDebug.originalResumeAnalysis}
                  />
                  <DebugJsonPanel
                    title="3. AI Tailored Result"
                    subtitle={`Model/result path: ${String(tailoringDebug.aiModelUsed ?? tailoringDebug.provider ?? "pending")}`}
                    value={
                      tailoringDebug.tailoredResult ?? {
                        status: "not_recorded",
                        message:
                          "This task was created before tailored-result debug tracking was initialized, or the task has not reached the tailoring step yet.",
                      }
                    }
                  />
                  <DebugJsonPanel
                    title="4. Validation Check"
                    subtitle="Runs after a tailored resume is available"
                    value={
                      tailoringDebug.validation ?? {
                        status: "not_started",
                        message:
                          "Validation has not run yet, or this older task did not record validation debug data.",
                      }
                    }
                  />
                </div>
              ) : null}

              <div
                className="task-queue-kawaii-scroll"
                style={{
                  display: "grid",
                  gap: 10,
                  maxHeight: "44vh",
                  overflowY: "auto",
                  paddingRight: 4,
                }}
              >
                {task.events.length ? (
                  task.events.map((event, index) => {
                    const eventTheme =
                      event.tone === "success"
                        ? KAWAII.completed
                        : event.tone === "error"
                          ? KAWAII.failed
                          : KAWAII.pending;

                    return (
                      <div
                        key={`${event.label}-${index}`}
                        style={{
                          background: KAWAII.surface,
                          border: `1.5px solid ${eventTheme.edge}`,
                          borderRadius: 16,
                          padding: "12px 14px",
                          boxShadow: `0 2px 0 ${eventTheme.edge}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: KAWAII.ink,
                          }}
                        >
                          {event.label}
                        </div>
                        <div
                          style={{
                            marginTop: 5,
                            fontSize: 11,
                            color: eventTheme.ink,
                            fontFamily:
                              '"JetBrains Mono", ui-monospace, monospace',
                          }}
                        >
                          {formatTaskTime(event.createdAt) ||
                            "Background worker"}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div
                    style={{
                      padding: "18px 14px",
                      borderRadius: 16,
                      background: KAWAII.surface,
                      border: `1.5px solid ${KAWAII.line}`,
                      color: KAWAII.inkSoft,
                      fontSize: 13,
                    }}
                  >
                    No task events yet.
                  </div>
                )}
              </div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

function FullPanel({
  tasks,
  activeTasks,
  clearableTasks,
  isLoading,
  isManualReloading,
  loadMessage,
  isQueueBusy,
  busyAction,
  now,
  onMinimize,
  onManualReload,
  onOpenDetails,
  onCancelAll,
  onClearAll,
  onCancel,
  onRemove,
}: {
  tasks: SafeBackgroundTask[];
  activeTasks: SafeBackgroundTask[];
  clearableTasks: SafeBackgroundTask[];
  isLoading: boolean;
  isManualReloading: boolean;
  loadMessage: string;
  isQueueBusy: boolean;
  busyAction: "dismiss" | "retry" | "cancel" | "cancel_all" | "clear" | null;
  now: number;
  onMinimize: () => void;
  onManualReload: () => void;
  onOpenDetails: (taskId: string) => void;
  onCancelAll: () => void;
  onClearAll: () => void;
  onCancel: (task: SafeBackgroundTask) => void;
  onRemove: (task: SafeBackgroundTask) => void;
}) {
  const counts = useMemo(
    () =>
      tasks.reduce(
        (accumulator, task) => {
          accumulator[getTaskDisplayStatus(task)] += 1;
          return accumulator;
        },
        {
          uploading: 0,
          pending: 0,
          running: 0,
          streaming: 0,
          completed: 0,
          failed: 0,
          canceled: 0,
        },
      ),
    [tasks],
  );

  const mood = getTaskMood(tasks);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<"all" | SafeBackgroundTask["status"]>(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const filteredTasks = tasks.filter(
    (task) =>
      (filter === "all" ||
        getTaskDisplayStatus(task) === filter ||
        (filter === "running" && getTaskDisplayStatus(task) === "streaming")) &&
      taskMatchesSearch(task, searchQuery),
  );
  const groupedTasks = filteredTasks.reduce(
    (groups, task) => {
      const dayKey = getTaskDayKey(task);
      const existingGroup = groups.find((group) => group.dayKey === dayKey);

      if (existingGroup) {
        existingGroup.tasks.push(task);
      } else {
        groups.push({ dayKey, tasks: [task] });
      }

      return groups;
    },
    [] as Array<{ dayKey: string; tasks: SafeBackgroundTask[] }>,
  );
  const activeCount = counts.running + counts.streaming;
  const hasActiveRun = counts.uploading > 0 || activeCount > 0 || counts.pending > 0;

  return (
    <section
      style={{
        pointerEvents: "auto",
        width: "min(380px, calc(100vw - 1rem))",
        maxHeight: "calc(100vh - 1rem)",
        minHeight: 0,
        background: `linear-gradient(180deg, ${KAWAII.surfaceSoft} 0%, ${KAWAII.bg} 100%)`,
        borderRadius: "24px 0 0 24px",
        boxShadow:
          "-20px 0 50px -20px rgba(180,155,230,0.35), 0 0 0 1.5px rgba(234,222,250,0.9)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
        color: KAWAII.ink,
        position: "relative",
      }}
    >
      <svg
        style={{
          position: "absolute",
          top: -40,
          right: -30,
          opacity: 0.45,
          pointerEvents: "none",
        }}
        width="180"
        height="180"
        viewBox="0 0 180 180"
      >
        <circle cx="100" cy="80" r="60" fill="#F5D9EE" />
        <circle cx="140" cy="40" r="22" fill="#E4EDFF" />
      </svg>
      <svg
        style={{
          position: "absolute",
          bottom: -30,
          left: -20,
          opacity: 0.35,
          pointerEvents: "none",
        }}
        width="160"
        height="160"
        viewBox="0 0 160 160"
      >
        <circle cx="60" cy="100" r="50" fill="#E5F4EB" />
      </svg>

      {isQueueBusy ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.52)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 999,
              background: KAWAII.surface,
              border: `1.5px solid ${KAWAII.line}`,
              boxShadow: "0 18px 36px -26px rgba(95,71,135,0.48)",
              fontSize: 12,
              fontWeight: 700,
              color: KAWAII.ink,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: KAWAII.running.dot,
                animation: "taskQueueKawaiiPulse 1.3s ease-in-out infinite",
              }}
            />
            {busyAction === "cancel"
              ? "Canceling task..."
              : busyAction === "cancel_all"
                ? "Canceling active tasks..."
                : busyAction === "dismiss"
                  ? "Deleting history..."
                  : busyAction === "clear"
                    ? "Clearing history..."
                    : "Updating task..."}
          </div>
        </div>
      ) : null}

      <div
        style={{
          padding: "18px 20px 14px 20px",
          position: "relative",
          zIndex: 2,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <Mascot size={44} mood={mood} />
            {hasActiveRun ? (
              <span
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: KAWAII.running.dot,
                  border: `2px solid ${KAWAII.surface}`,
                  animation: "taskQueueKawaiiPulse 1.3s ease-in-out infinite",
                }}
              />
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>
              Task Queue
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 600,
                  color: KAWAII.accent2,
                  background: "#F3EBFF",
                  padding: "2px 8px",
                  borderRadius: 999,
                  verticalAlign: "middle",
                }}
              >
                ✦ buni
              </span>
            </div>
            <div
              style={{ fontSize: 11.5, color: KAWAII.inkSoft, marginTop: 2 }}
            >
              {counts.uploading > 0
                ? `${counts.uploading} uploading`
                : isLoading
                  ? "checking task queue..."
                  : loadMessage
                    ? loadMessage
                : activeCount > 0
                ? `${activeCount} task${activeCount > 1 ? "s" : ""} active · let's go!`
                : counts.pending > 0
                  ? `${counts.pending} waiting in queue`
                  : counts.failed > 0
                    ? `oh no, ${counts.failed} failed`
                    : counts.completed > 0
                      ? "all done · good job!"
                      : "queue is empty ♡"}
            </div>
          </div>
          <IconButton
            title="Minimize"
            onClick={onMinimize}
            disabled={isQueueBusy}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 19 L19 19"
                stroke={KAWAII.inkSoft}
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            <CountChip status="uploading" count={counts.uploading} label="uploading" />
            <CountChip status="running" count={activeCount} label="active" />
            <CountChip status="pending" count={counts.pending} label="queued" />
            <CountChip status="completed" count={counts.completed} label="done" />
            <CountChip status="failed" count={counts.failed} label="failed" />
          </div>
          {!isSearchOpen ? (
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search tasks"
              aria-expanded={isSearchOpen}
              style={{
                border: `1.5px solid ${KAWAII.line}`,
                borderRadius: 12,
                background: "rgba(255,255,255,0.72)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78)",
                color: KAWAII.inkMute,
                cursor: "pointer",
                display: "grid",
                flexShrink: 0,
                height: 34,
                placeItems: "center",
                width: 34,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                <path
                  d="m16 16 4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>

        {isSearchOpen ? (
          <label
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: `1.5px solid ${KAWAII.line}`,
              borderRadius: 14,
              background: "rgba(255,255,255,0.72)",
              padding: "8px 10px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0, color: KAWAII.inkMute }}
            >
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
              <path
                d="m16 16 4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search tasks"
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                color: KAWAII.ink,
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
              aria-label="Close task search"
              style={{
                border: "none",
                borderRadius: 8,
                background: KAWAII.surfaceSoft,
                color: KAWAII.inkSoft,
                cursor: "pointer",
                display: "grid",
                height: 22,
                lineHeight: 1,
                padding: 0,
                placeItems: "center",
                width: 22,
                flexShrink: 0,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2 2 L8 8 M8 2 L2 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </label>
        ) : null}
      </div>

      <div
        className="task-queue-kawaii-tabs-scroll"
        style={{
          borderBottom: `1px solid ${KAWAII.line}`,
          flexShrink: 0,
          overflowX: "auto",
          overflowY: "hidden",
          position: "relative",
          zIndex: 2,
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: 4,
            minHeight: "max-content",
            padding: "0 28px 0 20px",
            width: "max-content",
          }}
        >
          {[
            ["all", "All", tasks.length],
            ["uploading", "Uploading", counts.uploading],
            ["running", "Running", activeCount],
            ["pending", "Queued", counts.pending],
            ["completed", "Done", counts.completed],
            ["failed", "Failed", counts.failed],
          ].map(([key, label, count]) => {
            const active = filter === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setFilter(key as "all" | SafeBackgroundTask["status"])
                }
                style={{
                  border: "none",
                  background: "transparent",
                  padding: "10px 10px 12px 10px",
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? KAWAII.ink : KAWAII.inkMute,
                  cursor: "pointer",
                  position: "relative",
                  fontFamily: "inherit",
                  flex: "0 0 auto",
                  whiteSpace: "nowrap",
                }}
              >
                {label}{" "}
                <span style={{ opacity: 0.55, fontWeight: 500 }}>{count}</span>
                {active ? (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -1,
                      left: 6,
                      right: 6,
                      height: 3,
                      borderRadius: 3,
                      background: `linear-gradient(90deg, ${KAWAII.accent2}, ${KAWAII.accent})`,
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="task-queue-kawaii-scroll"
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          padding: "14px 16px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          position: "relative",
          zIndex: 2,
        }}
      >
        {isLoading ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              color: KAWAII.inkSoft,
              fontSize: 13,
              paddingTop: 20,
              textAlign: "center",
            }}
          >
            <div style={{ position: "relative" }}>
              <Mascot size={72} mood="working" />
              <span
                aria-hidden="true"
                className="task-queue-kawaii-loader-ring"
                style={{
                  position: "absolute",
                  inset: -8,
                  borderRadius: 999,
                  border: `2px solid ${KAWAII.running.edge}`,
                  borderTopColor: KAWAII.running.dot,
                  borderRightColor: KAWAII.uploading.dot,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: 4,
                  right: 4,
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: KAWAII.running.dot,
                  border: `2px solid ${KAWAII.surface}`,
                  animation: "taskQueueKawaiiPulse 1.3s ease-in-out infinite",
                }}
              />
            </div>
            <div style={{ fontWeight: 700, color: KAWAII.ink }}>
              loading task queue
            </div>
            <div style={{ fontSize: 11.5, maxWidth: 220 }}>
              checking current resume tasks and progress
            </div>
            <div
              aria-label="Loading task queue"
              role="status"
              style={{
                width: "min(220px, 78%)",
                height: 8,
                borderRadius: 999,
                background: KAWAII.running.bg,
                border: `1px solid ${KAWAII.running.edge}`,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <span
                className="task-queue-kawaii-loader-bar"
                style={{
                  position: "absolute",
                  inset: "1px auto 1px 1px",
                  width: "42%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${KAWAII.uploading.dot}, ${KAWAII.running.dot})`,
                }}
              />
            </div>
          </div>
        ) : loadMessage ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: KAWAII.inkSoft,
              fontSize: 13,
              paddingTop: 20,
              textAlign: "center",
            }}
          >
            <Mascot size={72} mood="sad" />
            <div style={{ fontWeight: 700, color: KAWAII.failed.ink }}>
              task history not loaded
            </div>
            <div style={{ fontSize: 11.5, maxWidth: 240 }}>{loadMessage}</div>
            <button
              type="button"
              onClick={onManualReload}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
                padding: "8px 12px",
                border: `1.5px solid ${KAWAII.running.edge}`,
                borderRadius: 12,
                background: KAWAII.surface,
                color: KAWAII.running.ink,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
              }}
              className="task-queue-kawaii-footer-btn"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 12 A 8 8 0 1 1 17.7 6.4 M20 5 V 12 H 13"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Retry
            </button>
          </div>
        ) : groupedTasks.length ? (
          groupedTasks.map((group) => (
            <section
              key={group.dayKey}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 2px",
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: KAWAII.inkSoft,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  {formatTaskDayLabel(group.dayKey)}
                </span>
                <span
                  style={{
                    height: 1,
                    flex: 1,
                    background: KAWAII.line,
                    opacity: 0.8,
                  }}
                />
                <span
                  style={{
                    border: `1px solid ${KAWAII.line}`,
                    borderRadius: 999,
                    background: KAWAII.surface,
                    color: KAWAII.inkSoft,
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "2px 7px",
                  }}
                >
                  {group.tasks.length}
                </span>
              </div>

              {group.tasks.map((task) => (
                <TaskRow
                  key={getTaskStableKey(task)}
                  task={task}
                  now={now}
                  isQueueBusy={isQueueBusy}
                  onOpenDetails={() => onOpenDetails(task.id)}
                  onCancel={() => onCancel(task)}
                  onRemove={() => onRemove(task)}
                />
              ))}
            </section>
          ))
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: KAWAII.inkSoft,
              fontSize: 13,
              paddingTop: 20,
              textAlign: "center",
            }}
          >
            <Mascot size={72} mood="idle" />
            <div style={{ fontWeight: 600, color: KAWAII.ink }}>
              {searchQuery ? "no matching tasks" : "nothing here yet ♡"}
            </div>
            <div style={{ fontSize: 11.5, maxWidth: 220 }}>
              {searchQuery
                ? "try a file name, status, or task type"
                : "tasks will pop up here when you ask Buni to do something"}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding: "12px 16px 14px 16px",
          borderTop: `1px solid ${KAWAII.line}`,
          background: KAWAII.surface,
          display: "flex",
          gap: 8,
          position: "relative",
          zIndex: 2,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <FooterButton
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect
                x="6"
                y="6"
                width="12"
                height="12"
                rx="2.5"
                fill={KAWAII.failed.ink}
              />
            </svg>
          }
          label="Stop all"
          onClick={onCancelAll}
          disabled={!activeTasks.length}
          tone="failed"
        />
        <FooterButton
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 7 H 19 M 9 7 V 4.5 A 1 1 0 0 1 10 3.5 H 14 A 1 1 0 0 1 15 4.5 V 7 M 7 7 L 8 20 A 1 1 0 0 0 9 21 H 15 A 1 1 0 0 0 16 20 L 17 7"
                stroke={KAWAII.inkSoft}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          }
          label="Clear all"
          onClick={onClearAll}
          disabled={!clearableTasks.length}
        />
        <FooterButton
          icon={
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              style={
                isManualReloading
                  ? { animation: "taskQueueKawaiiSpin 0.7s linear infinite" }
                  : undefined
              }
            >
              <path
                d="M20 12 A 8 8 0 1 1 17.7 6.4 M20 5 V 12 H 13"
                stroke={isManualReloading ? KAWAII.running.ink : KAWAII.inkSoft}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          label="Refetch"
          onClick={onManualReload}
          disabled={isManualReloading || isLoading}
        />
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
            fontSize: 11,
            color: KAWAII.inkSoft,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: KAWAII.running.dot,
              animation: "taskQueueKawaiiPulse 1.3s ease-in-out infinite",
            }}
          />
          live
        </div>
      </div>
    </section>
  );
}

function MinimizedPanel({
  tasks,
  isLoading,
  loadMessage,
  onReload,
  onExpand,
}: {
  tasks: SafeBackgroundTask[];
  isLoading: boolean;
  loadMessage: string;
  onReload: () => void;
  onExpand: () => void;
}) {
  const counts = useMemo(
    () =>
      tasks.reduce(
        (accumulator, task) => {
          accumulator[getTaskDisplayStatus(task)] += 1;
          return accumulator;
        },
        {
          uploading: 0,
          pending: 0,
          running: 0,
          streaming: 0,
          completed: 0,
          failed: 0,
          canceled: 0,
        },
      ),
    [tasks],
  );

  const activeCount = counts.running + counts.streaming;
  const activeRun =
    isLoading
      ? null
      : tasks.find(
          (task) =>
            getTaskDisplayStatus(task) === "uploading" ||
            getTaskDisplayStatus(task) === "running" ||
            getTaskDisplayStatus(task) === "streaming",
        ) ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExpand();
        }
      }}
      style={{
        border: "none",
        cursor: "pointer",
        padding: 0,
        background: "transparent",
        fontFamily: '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
        textAlign: "left",
        pointerEvents: "auto",
      }}
      className="task-queue-kawaii-minimized"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px 8px 8px",
          background: KAWAII.surface,
          border: `1.5px solid ${KAWAII.line}`,
          borderRadius: "20px 0 0 20px",
          boxShadow:
            "-8px 6px 24px -8px rgba(184,155,232,0.35), 0 0 0 4px rgba(255,255,255,0.6)",
          minWidth: 260,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 44,
            height: 44,
            borderRadius: 999,
            background: "linear-gradient(135deg, #FFF4FB, #F3EBFF)",
            display: "grid",
            placeItems: "center",
            border: `1.5px solid ${KAWAII.line}`,
            flexShrink: 0,
          }}
        >
          <Mascot size={36} mood={getTaskMood(tasks)} />
          {counts.uploading > 0 ? (
            <MiniBadge status="uploading" count={counts.uploading} />
          ) : null}
          {isLoading || activeCount > 0 ? (
            <span
              style={{
                position: "absolute",
                bottom: -1,
                right: -1,
                width: 12,
                height: 12,
                borderRadius: 999,
                background: KAWAII.running.dot,
                border: `2px solid ${KAWAII.surface}`,
                animation: "taskQueueKawaiiPulse 1.3s ease-in-out infinite",
              }}
            />
          ) : null}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {isLoading ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: KAWAII.ink,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: KAWAII.running.dot,
                    animation: "taskQueueKawaiiPulse 1.3s ease-in-out infinite",
                    flexShrink: 0,
                  }}
                />
                loading task queue
              </div>
              <div
                style={{ fontSize: 11, color: KAWAII.inkSoft, marginTop: 2 }}
              >
                checking latest status...
              </div>
            </>
          ) : loadMessage ? (
            <>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: KAWAII.failed.ink,
                }}
              >
                task history not loaded
              </div>
              <div
                style={{ fontSize: 11, color: KAWAII.inkSoft, marginTop: 2 }}
              >
                tap to open details
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onReload();
                }}
                style={{
                  marginTop: 7,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  border: `1.5px solid ${KAWAII.running.edge}`,
                  borderRadius: 10,
                  background: KAWAII.surface,
                  color: KAWAII.running.ink,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "5px 9px",
                  fontFamily: "inherit",
                }}
                className="task-queue-kawaii-footer-btn"
              >
                Retry
              </button>
            </>
          ) : activeRun ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: KAWAII.ink,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: KAWAII.running.dot,
                    animation: "taskQueueKawaiiPulse 1.3s ease-in-out infinite",
                    flexShrink: 0,
                  }}
                />
                {getTaskDisplayTitle(activeRun)}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 5,
                }}
              >
                <div style={{ flex: 1 }}>
                  <ProgressBar
                    value={activeRun.progressPercent}
                    color={KAWAII.running.dot}
                    edge={KAWAII.running.edge}
                  />
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: KAWAII.running.ink,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    flexShrink: 0,
                    minWidth: 30,
                    textAlign: "right",
                  }}
                >
                  {Math.round(activeRun.progressPercent)}%
                </span>
              </div>
            </>
          ) : (
            <>
              <div
                style={{ fontSize: 12.5, fontWeight: 700, color: KAWAII.ink }}
              >
                {counts.failed > 0
                  ? "something went wrong"
                  : counts.completed > 0
                    ? "all done ♡"
                    : counts.pending > 0
                      ? "waiting in queue"
                      : "queue empty"}
              </div>
              <div
                style={{ fontSize: 11, color: KAWAII.inkSoft, marginTop: 2 }}
              >
                tap to open · Buni&apos;s here
              </div>
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 3,
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          {counts.uploading > 0 ? (
            <MiniBadge status="uploading" count={counts.uploading} />
          ) : null}
          {activeCount > 0 ? (
            <MiniBadge status="running" count={activeCount} />
          ) : null}
          {counts.pending > 0 ? (
            <MiniBadge status="pending" count={counts.pending} />
          ) : null}
          {counts.failed > 0 ? (
            <MiniBadge status="failed" count={counts.failed} />
          ) : null}
          {counts.completed > 0 ? (
            <MiniBadge status="completed" count={counts.completed} />
          ) : null}
        </div>

        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          style={{ flexShrink: 0, opacity: 0.6 }}
        >
          <path
            d="M14 7 L 9 12 L 14 17"
            stroke={KAWAII.inkSoft}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

export function TaskQueuePanel() {
  const router = useRouter();
  const { showErrorToast } = useToast();
  const [tasks, setTasks] = useState<SafeBackgroundTask[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<TaskQueueLoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "dismiss" | "retry" | "cancel" | "cancel_all" | "clear" | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const previousStatusesRef = useRef(
    new Map<string, SafeBackgroundTask["status"]>(),
  );
  const lastQueueMutationAtRef = useRef(0);
  const activeTaskIdsRef = useRef<string[]>([]);
  const consecutiveFailureCountRef = useRef(0);
  const isLoadingTasksRef = useRef(false);

  const activeTasks = useMemo(
    () => tasks.filter((task) => isActiveQueueTask(task)),
    [tasks],
  );
  const clearableTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status === "completed" ||
          task.status === "failed" ||
          task.status === "canceled",
      ),
    [tasks],
  );

  useEffect(() => {
    activeTaskIdsRef.current = activeTasks
      .filter((task) => !isOptimisticQueueTask(task))
      .map((task) => task.id);
  }, [activeTasks]);

  const loadTasks = useCallback(
    async (options: { force?: boolean } = {}) => {
      // Prevent overlapping requests. Without this guard, the loading-state
      // retry interval fires a new fetch every 5 s while the previous 15-second
      // request is still pending. Chrome cancels those via AbortController and
      // reports them as net::ERR_FAILED / "CORS error" in the console even
      // though the requests are same-origin — they're just aborted fetches.
      if (isLoadingTasksRef.current) {
        return;
      }

      isLoadingTasksRef.current = true;
      const requestStartedAt = Date.now();

      try {
        const { response, payload } =
          await fetchJsonWithTimeout<TaskListResponse>("/api/tasks", {
            timeoutMs: TASK_LIST_POLL_TIMEOUT_MS,
            timeoutMessage: "Task history is taking longer than usual to load. Retrying...",
          });

        if (response.status === 401) {
          setLoadStatus("unauthorized");
          setLoadError("Sign in to load task history.");
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error ?? "Tasks could not be loaded.");
        }

        const nextTasks = payload.tasks ?? [];

        if (
          !options.force &&
          requestStartedAt < lastQueueMutationAtRef.current
        ) {
          return;
        }

        consecutiveFailureCountRef.current = 0;
        setTasks((currentTasks) =>
          mergeServerTasksWithOptimisticTasks(nextTasks, currentTasks),
        );
        setLoadStatus("loaded");
        setLoadError("");

        const nextStatusMap = new Map<string, SafeBackgroundTask["status"]>();

        for (const task of nextTasks) {
          nextStatusMap.set(task.id, task.status);
          const previousStatus = previousStatusesRef.current.get(task.id);

          if (
            previousStatus &&
            previousStatus !== "completed" &&
            task.status === "completed" &&
            (task.resultResumeId || task.resultGenerationId)
          ) {
            handleCompletedTaskSideEffects(task, router);
          }
        }

        previousStatusesRef.current = nextStatusMap;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Task history could not be loaded.";
        consecutiveFailureCountRef.current += 1;
        console.warn("Task queue polling failed.", error);
        // Surface the error state only after 2 consecutive failures so a
        // single transient failure (database cold-start, network blip) doesn't
        // permanently break the panel — it stays in "loading" and auto-retries.
        if (consecutiveFailureCountRef.current >= 2) {
          setLoadStatus("error");
          setLoadError(message);
        }
      } finally {
        isLoadingTasksRef.current = false;
      }
    },
    [router],
  );

  const refreshVisibleActiveTasks = useCallback(async () => {
    const activeTaskIds = activeTaskIdsRef.current;

    if (!activeTaskIds.length) {
      return;
    }

    await Promise.allSettled(
      activeTaskIds.map(async (taskId) => {
        const { response, payload } =
          await fetchJsonWithTimeout<TaskResponse>(`/api/tasks/${taskId}`, {
            timeoutMs: TASK_DETAIL_POLL_TIMEOUT_MS,
            timeoutMessage: "Task status refresh timed out. Retrying...",
          });

        if (!response.ok || !payload.task) {
          return;
        }

        setTasks((currentTasks) =>
          upsertTaskByStableKey(currentTasks, payload.task as SafeBackgroundTask),
        );

        const previousStatus = previousStatusesRef.current.get(payload.task.id);
        previousStatusesRef.current.set(payload.task.id, payload.task.status);

        if (
          previousStatus &&
          previousStatus !== "completed" &&
          payload.task.status === "completed" &&
          (payload.task.resultResumeId || payload.task.resultGenerationId)
        ) {
          handleCompletedTaskSideEffects(payload.task as SafeBackgroundTask, router);
        }
      }),
    );
  }, [router]);

  const retryLoadTasks = useCallback(() => {
    consecutiveFailureCountRef.current = 0;
    setLoadStatus("loading");
    setLoadError("");
    void loadTasks({ force: true });
  }, [loadTasks]);

  useEffect(() => {
    const onHighlight = (event: Event) => {
      setIsExpanded(true);

      const detail =
        event instanceof CustomEvent &&
        detailLooksLikeQueueMutation(event.detail)
          ? event.detail
          : null;

      if (!detail) {
        void loadTasks({ force: true });
        return;
      }

      lastQueueMutationAtRef.current = Date.now();

      if (detail.action === "remove") {
        setTasks((currentTasks) =>
          currentTasks.filter((task) => task.id !== detail.taskId),
        );
        void loadTasks({ force: true });
        return;
      }

      setLoadStatus("loaded");
      setLoadError("");
      setTasks((currentTasks) => {
        const detailKey = getTaskStableKey(detail.task);
        return [
          detail.task,
          ...currentTasks.filter((task) => getTaskStableKey(task) !== detailKey),
        ];
      });
      void loadTasks({ force: true });
    };
    window.addEventListener("task-queue:highlight", onHighlight);
    return () =>
      window.removeEventListener("task-queue:highlight", onHighlight);
  }, [loadTasks]);

  useEffect(() => {
    if (!activeTasks.length) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeTasks.length]);

  useEffect(() => {
    void loadTasks({ force: true });
  }, [loadTasks]);

  useEffect(() => {
    if (!activeTasks.length) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadTasks({ force: true });
    }, 1200);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTasks.length, loadTasks]);

  useEffect(() => {
    if (!activeTasks.length) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshVisibleActiveTasks();
    }, 900);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTasks.length, refreshVisibleActiveTasks]);

  // Auto-retry while still in the "loading" state so the panel self-heals from
  // an initial failure without user interaction. When the first request fails
  // (consecutiveFailureCount = 1, still below the threshold for "error"), the
  // active-task polling and error-state retry effects never fire — leaving the
  // panel stuck on "loading task queue" forever. This effect fills that gap.
  useEffect(() => {
    if (loadStatus !== "loading") {
      return;
    }

    const timer = window.setInterval(() => {
      void loadTasks({ force: true });
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadStatus, loadTasks]);

  // Auto-retry while in the error state so the panel self-heals from
  // transient failures (database cold-start, network blip) without requiring
  // the user to click Retry. The normal polling effect is gated on
  // activeTasks.length > 0, so it would never kick in here.
  useEffect(() => {
    if (loadStatus !== "error") {
      return;
    }

    const timer = window.setInterval(() => {
      void loadTasks({ force: true });
    }, 8000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadStatus, loadTasks]);


  useEffect(() => {
    if (detailTaskId && !tasks.some((task) => task.id === detailTaskId)) {
      setDetailTaskId(null);
    }
  }, [detailTaskId, tasks]);

  const selectedTask = tasks.find((task) => task.id === detailTaskId) ?? null;
  const isQueueBusy = Boolean(busyTaskId);

  const mutateTask = async (
    task: SafeBackgroundTask,
    action: "dismiss" | "retry" | "cancel",
  ) => {
    if (isQueueBusy) {
      return;
    }

    if (action === "cancel") {
      const shouldCancel = await confirmTaskCancellation(
        task.fileName || task.title,
      );

      if (!shouldCancel) {
        return;
      }
    }

    lastQueueMutationAtRef.current = Date.now();
    setBusyTaskId(task.id);
    setBusyAction(action);

    try {
      const response =
        action === "dismiss"
          ? await fetch(`/api/tasks/${task.id}`, { method: "DELETE" })
          : action === "retry"
            ? await fetch(`/api/tasks/${task.id}/retry`, { method: "POST" })
            : await fetch(`/api/tasks/${task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "cancel" }),
              });

      const payload = (await response.json().catch(() => ({}))) as {
        task?: SafeBackgroundTask;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Task action failed.");
      }

      if (action === "dismiss") {
        setTasks((currentTasks) =>
          currentTasks.filter((entry) => entry.id !== task.id),
        );
        if (detailTaskId === task.id) {
          setDetailTaskId(null);
        }
        return;
      }

      if (payload.task) {
        setTasks((currentTasks) => [
          payload.task!,
          ...currentTasks.filter((entry) => entry.id !== payload.task!.id),
        ]);
        setDetailTaskId(payload.task.id);
      }
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Task action failed.",
        { title: "Queue action failed" },
      );
    } finally {
      setBusyTaskId(null);
      setBusyAction(null);
    }
  };

  const clearTaskHistory = async () => {
    if (isQueueBusy || !clearableTasks.length) {
      return;
    }

    const shouldClear = await confirmTaskQueueClear(clearableTasks.length);

    if (!shouldClear) {
      return;
    }

    setBusyTaskId("__queue__");
    setBusyAction("clear");
    lastQueueMutationAtRef.current = Date.now();

    try {
      const response = await fetch("/api/tasks", { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Task history could not be cleared.");
      }

      setTasks((currentTasks) =>
        currentTasks.filter(
          (task) => !["completed", "failed", "canceled"].includes(task.status),
        ),
      );

      if (
        detailTaskId &&
        ["completed", "failed", "canceled"].includes(
          tasks.find((task) => task.id === detailTaskId)?.status ?? "",
        )
      ) {
        setDetailTaskId(null);
      }
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Task history could not be cleared.",
        { title: "Queue action failed" },
      );
    } finally {
      setBusyTaskId(null);
      setBusyAction(null);
    }
  };

  const cancelAllActiveTasks = async () => {
    if (isQueueBusy || !activeTasks.length) {
      return;
    }

    const shouldCancel = await confirmAllTaskCancellation(activeTasks.length);

    if (!shouldCancel) {
      return;
    }

    setBusyTaskId("__queue__");
    setBusyAction("cancel_all");
    lastQueueMutationAtRef.current = Date.now();

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_active" }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Active tasks could not be canceled.");
      }

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.status === "uploading" ||
          task.status === "pending" ||
          task.status === "running" ||
          task.status === "streaming"
            ? {
                ...task,
                status: "canceled",
                stageKey: "canceled",
                stageLabel: "Canceled",
                completedAt: new Date().toISOString(),
                canCancel: false,
                canDismiss: true,
              }
            : task,
        ),
      );
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Active tasks could not be canceled.",
        { title: "Queue action failed" },
      );
    } finally {
      setBusyTaskId(null);
      setBusyAction(null);
    }
  };

  const [isManualReloading, setIsManualReloading] = useState(false);

  const manualReloadTasks = useCallback(async () => {
    // Skip if another request is already in flight (isLoadingTasksRef guard).
    if (isLoadingTasksRef.current) {
      return;
    }
    setIsManualReloading(true);
    try {
      await loadTasks({ force: true });
    } finally {
      setIsManualReloading(false);
    }
  }, [loadTasks]);

  const isInitialQueueLoading = loadStatus === "loading";
  const queueLoadMessage =
    tasks.length > 0
      ? ""
      : loadStatus === "unauthorized"
      ? "sign in to load task history"
      : loadStatus === "error"
        ? loadError || "task history could not be loaded"
        : "";

  return (
    <>
      <style jsx global>{`
        @keyframes taskQueueKawaiiPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.25);
            opacity: 0.75;
          }
        }
        @keyframes taskQueueKawaiiShimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes taskQueueKawaiiSlideIn {
          0% {
            opacity: 0;
            transform: translateX(18px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        @keyframes taskQueueKawaiiQueuedGlow {
          0%,
          100% {
            box-shadow: 0 2px 0 ${KAWAII.pending.edge};
          }
          50% {
            box-shadow:
              0 2px 0 ${KAWAII.pending.edge},
              0 0 0 4px rgba(255, 209, 74, 0.18);
          }
        }
        @keyframes taskQueueKawaiiSpin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes taskQueueKawaiiLoaderBar {
          0% {
            transform: translateX(-115%);
          }
          100% {
            transform: translateX(240%);
          }
        }
        .task-queue-kawaii-loader-ring {
          animation: taskQueueKawaiiSpin 1s linear infinite;
        }
        .task-queue-kawaii-loader-bar {
          animation: taskQueueKawaiiLoaderBar 1.15s ease-in-out infinite;
        }
        .task-queue-kawaii-row,
        .task-queue-kawaii-minimized,
        .task-queue-kawaii-icon-btn,
        .task-queue-kawaii-footer-btn {
          transition:
            transform 0.16s ease,
            box-shadow 0.16s ease,
            background 0.16s ease;
        }
        .task-queue-kawaii-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .task-queue-kawaii-scroll::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
        .task-queue-kawaii-row:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 24px -22px rgba(114, 84, 164, 0.45);
        }
        .task-queue-kawaii-row {
          animation: taskQueueKawaiiSlideIn 0.28s cubic-bezier(.2,.9,.3,1);
        }
        .task-queue-kawaii-row--queued {
          animation:
            taskQueueKawaiiSlideIn 0.28s cubic-bezier(.2,.9,.3,1),
            taskQueueKawaiiQueuedGlow 1.8s ease-in-out infinite;
        }
        .task-queue-kawaii-minimized:hover {
          transform: translateX(-3px);
        }
        .task-queue-kawaii-icon-btn:hover:not(:disabled) {
          background: ${KAWAII.line};
          transform: scale(1.08);
        }
        .task-queue-kawaii-footer-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 2px 0 ${KAWAII.line};
          background: ${KAWAII.surfaceSoft};
        }
      `}</style>

      <div className="pointer-events-none fixed right-0 top-2 z-[70] flex max-h-[calc(100vh-1rem)] w-[min(24rem,calc(100vw-0.5rem))] flex-col items-end gap-3">
        {isExpanded ? (
          <FullPanel
            tasks={tasks}
            activeTasks={activeTasks}
            clearableTasks={clearableTasks}
            isLoading={isInitialQueueLoading}
            isManualReloading={isManualReloading}
            loadMessage={queueLoadMessage}
            isQueueBusy={isQueueBusy}
            busyAction={busyAction}
            now={now}
            onMinimize={() => setIsExpanded(false)}
            onManualReload={() => void manualReloadTasks()}
            onOpenDetails={setDetailTaskId}
            onCancelAll={() => void cancelAllActiveTasks()}
            onClearAll={() => void clearTaskHistory()}
            onCancel={(task) => void mutateTask(task, "cancel")}
            onRemove={(task) => void mutateTask(task, "dismiss")}
          />
        ) : (
          <MinimizedPanel
            tasks={tasks}
            isLoading={isInitialQueueLoading}
            loadMessage={queueLoadMessage}
            onReload={retryLoadTasks}
            onExpand={() => setIsExpanded(true)}
          />
        )}
      </div>

      <TaskDetailsModal
        task={selectedTask}
        now={now}
        isQueueBusy={isQueueBusy}
        onClose={() => setDetailTaskId(null)}
        onRetry={() =>
          selectedTask ? void mutateTask(selectedTask, "retry") : undefined
        }
        onCancel={() =>
          selectedTask ? void mutateTask(selectedTask, "cancel") : undefined
        }
        onDismiss={() =>
          selectedTask ? void mutateTask(selectedTask, "dismiss") : undefined
        }
        onOpenProfile={() => {
          setDetailTaskId(null);
          router.push("/profile");
        }}
        onOpenDesignStudio={(generationId) => {
          setDetailTaskId(null);
          router.push(`/tailor/editor/${generationId}`);
        }}
        onOpenDownloadModal={(generationId) => {
          setDetailTaskId(null);
          router.push(`/retail/${generationId}?modal=download`);
        }}
        onOpenTailoringModal={(taskId) => {
          window.dispatchEvent(
            new CustomEvent("resume-tailoring:open-task", { detail: { taskId } }),
          );
          setDetailTaskId(null);
        }}
      />
    </>
  );
}
