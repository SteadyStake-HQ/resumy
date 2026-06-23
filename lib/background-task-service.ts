import { randomUUID } from "node:crypto";
import { Types } from "@/lib/id";
import {
  analyzeResumeWithAI,
  parseResumeWithAI,
  tailorResume,
  tailorResumeFallback,
  validateTailoredResumeQuality,
} from "@/lib/aiService";
import { normalizeAIProvider, type AIProvider } from "@/lib/ai-provider";
import { createAIUsageAccumulator, runWithAIUsage } from "@/lib/ai-usage-tracker";
import {
  toSafeBackgroundTask,
} from "@/lib/background-task";
import { inferCountryCodeFromResume } from "@/lib/countries";
import { toSafeGeneration } from "@/lib/generation";
import { normalizeGeminiRouterIndex } from "@/lib/gemini-router";
import { normalizeHuggingFaceRouterIndex } from "@/lib/huggingface-router";
import { connectToDatabase } from "@/lib/db";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";
import BackgroundTask from "@/models/BackgroundTask";
import BackgroundTaskLease from "@/models/BackgroundTaskLease";
import User from "@/models/User";
import {
  createEmptyResumeExtractionMeta,
  RESUME_SECTION_KEYS,
  toSafeResume,
} from "@/lib/resume";
import { extractKeywordCandidates, normalizeAnalyzedJobDescription } from "@/lib/job-description";
import { clipResumePromptText } from "@/lib/prompts/prompt-utils";
import { createInitialTailoredResumeDocumentStyle } from "@/lib/resume-document-style";
import {
  assessResumeParseConfidence,
  auditResumeExtraction,
  extractLocalSkillsCandidate,
  extractLocalSummaryCandidate,
  extractResumeTextFromFile,
  parseResumeFallback,
} from "@/lib/resume-processing";

const TASKIQ_BRIDGE_TIMEOUT_MS = 15_000;
const BACKGROUND_TASK_DISPATCH_LEASE_KEY = "resume-analysis-dispatch";
const BACKGROUND_TASK_DISPATCH_LEASE_MS = 15 * 60 * 1000;
const TASK_CANCELED_MESSAGE = "__TASK_CANCELED__";
const TASK_REMOVED_MESSAGE = "__TASK_REMOVED__";
const TASK_OWNERSHIP_LOST_MESSAGE = "__TASK_OWNERSHIP_LOST__";
const MAX_CONCURRENT_RESUME_TASKS = 3;
const BACKGROUND_TASK_TIMEOUT_MINUTES = 8;
const BACKGROUND_TASK_TIMEOUT_MS = BACKGROUND_TASK_TIMEOUT_MINUTES * 60 * 1000;
const TASKIQ_DISPATCH_TIMEOUT_MS = 2 * 60 * 1000;
const RESUME_TEXT_EXTRACTION_TIMEOUT_MS = 90 * 1000;
const RESUME_EXTRACTION_AI_TIMEOUT_MS = 120 * 1000;
const HUGGINGFACE_RESUME_EXTRACTION_AI_TIMEOUT_MS = 240 * 1000;
const RESUME_ANALYSIS_AI_TIMEOUT_MS = 90 * 1000;
const RESUME_TAILORING_AI_TIMEOUT_MS = 120 * 1000;
// Overall wall-clock budget for the tailoring pipeline. Kept comfortably under
// the route's `maxDuration` (300s) so that if any step hangs, the task is
// concluded as failed in the DB *before* the platform kills the function and
// leaves the task stuck in "running" forever.
const RESUME_TAILORING_PIPELINE_BUDGET_MS = 255 * 1000;

function createAIOnlyResumeExtractionMeta() {
  const extractionMeta = createEmptyResumeExtractionMeta();
  const updatedAt = new Date().toISOString();

  extractionMeta.rawTextAvailable = true;

  for (const section of RESUME_SECTION_KEYS) {
    extractionMeta.sections[section] = {
      source: "ai",
      confidence: 100,
      updatedAt,
      issues: [],
    };
  }

  return extractionMeta;
}

function createTimeoutError(message: string) {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

function getResumeExtractionTimeoutMs(provider: AIProvider) {
  return provider === "huggingface"
    ? HUGGINGFACE_RESUME_EXTRACTION_AI_TIMEOUT_MS
    : RESUME_EXTRACTION_AI_TIMEOUT_MS;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(createTimeoutError(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  const record = error as Record<string, unknown>;
  const cause = record.cause;

  if (typeof record.code === "string") {
    return record.code;
  }

  if (cause && typeof cause === "object") {
    const causeCode = (cause as Record<string, unknown>).code;
    return typeof causeCode === "string" ? causeCode : "";
  }

  return "";
}

function logTaskiqFallback(kind: "resume" | "tailoring", error: unknown) {
  const code = getErrorCode(error);
  const label = kind === "resume" ? "Resume analysis" : "Resume tailoring";

  if (code === "ECONNREFUSED") {
    console.info(
      `${label} Taskiq bridge is unavailable; using local background processing.`,
    );
    return;
  }

  console.warn(
    `${label} Taskiq enqueue failed; using local background processing.`,
    error,
  );
}

function getSafeErrorDetails(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return {
    name: error instanceof Error ? error.name : typeof error,
    code: getErrorCode(error) || null,
    message: message
      .replace(
        /((?:postgres(?:ql)?|redis(?:s)?):\/\/)[^@\s]+@/gi,
        "$1[credentials redacted]@",
      )
      .slice(0, 800),
  };
}

function getSafeBridgeOrigin(bridgeUrl: string) {
  try {
    return new URL(bridgeUrl).origin;
  } catch {
    return "invalid_bridge_url";
  }
}

function normalizeBridgeUrl(value: string | undefined) {
  const bridgeUrl = value?.trim().replace(/\/$/, "");

  if (!bridgeUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(bridgeUrl)) {
    return bridgeUrl;
  }

  const protocol = /^(localhost|127\.0\.0\.1)(?::|\/|$)/i.test(bridgeUrl)
    ? "http"
    : "https";

  return `${protocol}://${bridgeUrl}`;
}

async function recordTaskiqDispatch(
  taskId: string,
  dispatch: Record<string, unknown>,
  event: { label: string; tone?: "info" | "success" | "error" },
  taskUpdate: Record<string, unknown> = {},
) {
  const now = new Date();
  await BackgroundTask.findByIdAndUpdate(taskId, {
    $set: {
      ...taskUpdate,
      "debugData.taskiqDispatch": {
        ...dispatch,
        updatedAt: now.toISOString(),
      },
    },
    $push: {
      events: {
        label: event.label,
        tone: event.tone ?? "info",
        createdAt: now,
      },
    },
  });
}

async function recordResumeProcessingDebug(
  taskId: string,
  debugData: Record<string, unknown>,
) {
  await BackgroundTask.findByIdAndUpdate(taskId, {
    $set: {
      "debugData.resumeProcessing": {
        ...debugData,
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

async function failTaskiqDispatch(
  taskId: string,
  debugId: string,
  bridgeUrl: string,
  startedAt: number,
  error: unknown,
) {
  const details = getSafeErrorDetails(error);
  const message = `Taskiq enqueue failed: ${details.message}`;

  await recordTaskiqDispatch(
    taskId,
    {
      debugId,
      state: "failed",
      bridgeOrigin: getSafeBridgeOrigin(bridgeUrl),
      durationMs: Date.now() - startedAt,
      error: details,
    },
    { label: message, tone: "error" },
    {
      status: "failed",
      stageKey: "failed",
      stageLabel: "Background worker could not be reached",
      error: message,
      completedAt: new Date(),
      processingToken: null,
    },
  );

  console.error("[taskiq:dispatch] enqueue_failed", {
    taskId,
    debugId,
    bridgeOrigin: getSafeBridgeOrigin(bridgeUrl),
    durationMs: Date.now() - startedAt,
    error: details,
  });
}

function getAppBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    `http://127.0.0.1:${process.env.PORT || 3000}`
  );
}

async function assertTaskCanContinue(taskId: string, processingToken: string) {
  const task = await BackgroundTask.findById(taskId)
    .select("status processingToken")
    .lean();

  if (!task) {
    throw new Error(TASK_REMOVED_MESSAGE);
  }

  if (task.processingToken !== processingToken) {
    throw new Error(TASK_OWNERSHIP_LOST_MESSAGE);
  }

  if (task.status === "canceled") {
    throw new Error(TASK_CANCELED_MESSAGE);
  }
}

async function appendTaskEvent(
  taskId: string,
  processingToken: string | null,
  label: string,
  tone: "info" | "success" | "error" = "info",
) {
  const update = {
    $push: {
      events: {
        label,
        tone,
        createdAt: new Date(),
      },
    },
  };

  if (!processingToken) {
    await BackgroundTask.findByIdAndUpdate(taskId, update);
    return;
  }

  await BackgroundTask.findOneAndUpdate(
    { _id: taskId, processingToken },
    update,
  );
}

async function updateTaskStage(
  taskId: string,
  processingToken: string,
  stageKey: string,
  stageLabel: string,
  progressPercent: number,
  tone: "info" | "success" | "error" = "info",
) {
  await BackgroundTask.findOneAndUpdate(
    { _id: taskId, processingToken },
    {
      stageKey,
      stageLabel,
      progressPercent,
    },
  );
  await appendTaskEvent(taskId, processingToken, stageLabel, tone);
}

async function claimTaskForProcessing(taskId: string, processingToken: string) {
  return BackgroundTask.findOneAndUpdate(
    {
      _id: taskId,
      $or: [
        { status: "pending" },
        { status: "running", processingToken: null },
      ],
    },
    {
      status: "running",
      startedAt: new Date(),
      stageKey: "preparing",
      stageLabel: "Preparing your resume",
      progressPercent: 5,
      processingToken,
    },
    { returnDocument: "after" },
  );
}

async function countActiveResumeTasks(type: "resume_analysis" | "resume_tailoring") {
  return BackgroundTask.countDocuments({
    type,
    status: { $in: ["running", "streaming"] },
    processingToken: { $ne: null },
  });
}

async function countStartingResumeTasks(type: "resume_analysis" | "resume_tailoring") {
  return BackgroundTask.countDocuments({
    type,
    status: "pending",
    stageKey: "starting",
  });
}

async function failTimedOutBackgroundTasks() {
  const cutoff = new Date(Date.now() - BACKGROUND_TASK_TIMEOUT_MS);

  await BackgroundTask.updateMany(
    {
      status: { $in: ["running", "streaming"] },
      $or: [
        { startedAt: { $lte: cutoff } },
        { startedAt: null, createdAt: { $lte: cutoff } },
      ],
    },
    {
      status: "failed",
      stageKey: "failed",
      stageLabel: "Task timed out",
      error: `Task timed out after running for more than ${BACKGROUND_TASK_TIMEOUT_MINUTES} minutes.`,
      completedAt: new Date(),
      processingToken: null,
      $push: {
        events: {
          label: `Task timed out after running for more than ${BACKGROUND_TASK_TIMEOUT_MINUTES} minutes.`,
          tone: "error",
          createdAt: new Date(),
        },
      },
    },
  );
}

async function failStalledTaskiqDispatches() {
  const cutoff = new Date(Date.now() - TASKIQ_DISPATCH_TIMEOUT_MS);
  const message =
    "The task was not acknowledged by the background worker within 2 minutes.";

  await BackgroundTask.updateMany(
    {
      status: "pending",
      stageKey: "starting",
      createdAt: { $lte: cutoff },
    },
    {
      status: "failed",
      stageKey: "failed",
      stageLabel: "Background worker did not acknowledge the task",
      error: message,
      completedAt: new Date(),
      processingToken: null,
      $push: {
        events: {
          label: message,
          tone: "error",
          createdAt: new Date(),
        },
      },
    },
  );
}

function isBackgroundTaskLeaseConflict(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const code = error.code;
  return code === 11000 || code === "P2002" || code === "23505";
}

async function acquireBackgroundTaskDispatchLease(ownerToken: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BACKGROUND_TASK_DISPATCH_LEASE_MS);

  try {
    const lease = await BackgroundTaskLease.findOneAndUpdate(
      {
        key: BACKGROUND_TASK_DISPATCH_LEASE_KEY,
        $or: [
          { expiresAt: { $lte: now } },
          { ownerToken },
        ],
      },
      {
        key: BACKGROUND_TASK_DISPATCH_LEASE_KEY,
        ownerToken,
        expiresAt,
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      },
    );

    return lease?.ownerToken === ownerToken;
  } catch (error) {
    if (isBackgroundTaskLeaseConflict(error)) {
      return false;
    }

    throw error;
  }
}

async function releaseBackgroundTaskDispatchLease(ownerToken: string) {
  await BackgroundTaskLease.deleteOne({
    key: BACKGROUND_TASK_DISPATCH_LEASE_KEY,
    ownerToken,
  });
}

async function findNextPendingResumeAnalysisTaskIds(
  limit: number,
  preferredTaskId?: string | null,
): Promise<string[]> {
  const ids: string[] = [];

  if (preferredTaskId) {
    const preferredTask = await BackgroundTask.findOne({
      _id: preferredTaskId,
      type: "resume_analysis",
      $or: [
        { status: "pending" },
        { status: "running", processingToken: null },
      ],
    })
      .select("_id")
      .lean();

    if (preferredTask?._id) {
      ids.push(preferredTask._id.toString());
    }
  }

  if (ids.length < limit) {
    const excludeIds = ids.slice();
    const nextTasks = await BackgroundTask.find({
      type: "resume_analysis",
      $or: [
        { status: "pending" },
        { status: "running", processingToken: null },
      ],
      ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {}),
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit - ids.length)
      .select("_id")
      .lean();

    for (const task of nextTasks) {
      if (task._id) {
        ids.push(task._id.toString());
      }
    }
  }

  return ids;
}

async function findNextPendingResumeTailoringTaskId(preferredTaskId?: string | null) {
  const ids = await findNextPendingResumeTailoringTaskIds(1, preferredTaskId);
  return ids[0] ?? null;
}

async function findNextPendingResumeTailoringTaskIds(
  limit: number,
  preferredTaskId?: string | null,
): Promise<string[]> {
  const ids: string[] = [];

  if (preferredTaskId) {
    const preferredTask = await BackgroundTask.findOne({
      _id: preferredTaskId,
      type: "resume_tailoring",
      $or: [
        { status: "pending" },
        { status: "running", processingToken: null },
      ],
    })
      .select("_id")
      .lean();

    if (preferredTask?._id) {
      ids.push(preferredTask._id.toString());
    }
  }

  if (ids.length < limit) {
    const excludeIds = ids.slice();
    const nextTasks = await BackgroundTask.find({
      type: "resume_tailoring",
      $or: [
        { status: "pending" },
        { status: "running", processingToken: null },
      ],
      ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {}),
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit - ids.length)
      .select("_id")
      .lean();

    for (const task of nextTasks) {
      if (task._id) {
        ids.push(task._id.toString());
      }
    }
  }

  return ids;
}

async function kickResumeTailoringDispatcherIfStalled(preferredTaskId?: string | null) {
  const runningCount = await countActiveResumeTasks("resume_tailoring");

  if (runningCount >= MAX_CONCURRENT_RESUME_TASKS) {
    return false;
  }

  const nextTaskId = await findNextPendingResumeTailoringTaskId(preferredTaskId);

  if (!nextTaskId) {
    return false;
  }

  void processPendingResumeTailoringTasks(nextTaskId).catch((error) => {
    console.warn("Failed to restart stalled tailoring task dispatcher.", error);
  });

  return true;
}

async function kickResumeAnalysisDispatcherIfStalled(preferredTaskId?: string | null) {
  const runningCount = await countActiveResumeTasks("resume_analysis");

  if (runningCount >= MAX_CONCURRENT_RESUME_TASKS) {
    return false;
  }

  const nextTaskIds = await findNextPendingResumeAnalysisTaskIds(1, preferredTaskId);
  const nextTaskId = nextTaskIds[0] ?? null;

  if (!nextTaskId) {
    return false;
  }

  void processPendingResumeAnalysisTasks(nextTaskId).catch((error) => {
    console.warn("Failed to restart stalled resume analysis task dispatcher.", error);
  });

  return true;
}

function enqueueLocalTaskProcessing(taskId: string) {
  void processPendingResumeAnalysisTasks(taskId).catch(async (error) => {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Local background processing could not be started.";

    console.error("Local background task trigger failed.", error);

    try {
      await connectToDatabase();
      await BackgroundTask.findOneAndUpdate(
        { _id: taskId, status: { $in: ["pending", "running", "streaming"] } },
        {
          status: "failed",
          stageKey: "failed",
          stageLabel: "Task failed",
          error: errorMessage,
          completedAt: new Date(),
          processingToken: null,
          $push: {
            events: {
              label: errorMessage,
              tone: "error",
              createdAt: new Date(),
            },
          },
        },
      );
    } catch (updateError) {
      console.error("Failed to mark local task trigger error on background task.", updateError);
    }
  });
}

async function claimResumeAnalysisTasksForProcessing(
  taskIds: string[],
): Promise<Array<{ id: string; processingToken: string }>> {
  const claimedTasks: Array<{ id: string; processingToken: string }> = [];

  for (const taskId of taskIds) {
    const processingToken = randomUUID();
    const task = await claimTaskForProcessing(taskId, processingToken);

    if (task?._id) {
      claimedTasks.push({
        id: task._id.toString(),
        processingToken,
      });
    }
  }

  return claimedTasks;
}

async function reclaimRunningResumeAnalysisTask(taskId: string) {
  const existingTask = await BackgroundTask.findOne({
    _id: taskId,
    type: "resume_analysis",
    status: "running",
    processingToken: { $ne: null },
  })
    .select("_id processingToken")
    .lean();

  if (!existingTask?.processingToken) {
    return null;
  }

  const processingToken = randomUUID();
  const reclaimedTask = await BackgroundTask.findOneAndUpdate(
    {
      _id: taskId,
      status: "running",
      processingToken: existingTask.processingToken,
    },
    {
      processingToken,
      startedAt: new Date(),
      stageKey: "preparing",
      stageLabel: "Resuming background processing",
      progressPercent: 5,
      $push: {
        events: {
          label: "Recovered an orphaned background-processing claim",
          tone: "info",
          createdAt: new Date(),
        },
      },
    },
    { returnDocument: "after" },
  );

  return reclaimedTask?._id
    ? { id: reclaimedTask._id.toString(), processingToken }
    : null;
}

function enqueueLocalResumeTailoringProcessing(taskId: string) {
  void processPendingResumeTailoringTasks(taskId).catch(async (error) => {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Local tailoring processing could not be started.";

    console.error("Local tailoring task trigger failed.", error);

    try {
      await connectToDatabase();
      await BackgroundTask.findOneAndUpdate(
        { _id: taskId, status: { $in: ["pending", "running", "streaming"] } },
        {
          status: "failed",
          stageKey: "failed",
          stageLabel: "Tailoring failed",
          error: errorMessage,
          completedAt: new Date(),
          processingToken: null,
          $push: {
            events: {
              label: errorMessage,
              tone: "error",
              createdAt: new Date(),
            },
          },
        },
      );
    } catch (updateError) {
      console.error("Could not mark local tailoring task as failed.", updateError);
    }
  });
}

export async function listBackgroundTasksForUser(userId: string) {
  await connectToDatabase();

  // Never launch local processing after a production serverless response.
  // Enqueueing is awaited by the upload/tailoring routes; polling only marks
  // old unacknowledged dispatches as failed so the user can retry them.
  void failTimedOutBackgroundTasks().catch((e) => {
    console.warn("[listBackgroundTasksForUser] failTimedOutBackgroundTasks failed:", e);
  });

  if (process.env.NODE_ENV === "production") {
    await failStalledTaskiqDispatches();
  } else {
    void kickResumeAnalysisDispatcherIfStalled().catch((e) => {
      console.warn("[listBackgroundTasksForUser] kickResumeAnalysisDispatcherIfStalled failed:", e);
    });
    void kickResumeTailoringDispatcherIfStalled().catch((e) => {
      console.warn("[listBackgroundTasksForUser] kickResumeTailoringDispatcherIfStalled failed:", e);
    });
  }

  const tasks = await BackgroundTask.find({ userId })
    .sort({ createdAt: -1 })
    .lean();

  return tasks.map((task) => toSafeBackgroundTask(task));
}

export async function clearDismissibleBackgroundTasksForUser(userId: string) {
  await connectToDatabase();

  const result = await BackgroundTask.deleteMany({
    userId,
    status: { $in: ["completed", "failed", "canceled"] },
  });

  return { ok: true, deletedCount: result.deletedCount ?? 0 };
}

export async function cancelActiveBackgroundTasksForUser(userId: string) {
  await connectToDatabase();

  const now = new Date();
  const activeTasks = await BackgroundTask.find({
    userId,
    status: { $in: ["pending", "running", "streaming"] },
  });

  if (!activeTasks.length) {
    return { ok: true, canceledCount: 0 };
  }

  for (const task of activeTasks) {
    const wasRunning = task.status === "running";
    task.status = "canceled";
    task.stageKey = "canceled";
    task.stageLabel = "Canceled";
    task.completedAt = now;
    task.processingToken = null;
    task.events.push({
      label: wasRunning
        ? "Canceled while processing was in progress"
        : "Canceled before processing started",
      tone: "error",
      createdAt: now,
    });
  }

  await Promise.all(activeTasks.map((task) => task.save()));

  return { ok: true, canceledCount: activeTasks.length };
}

export async function createResumeAnalysisTask(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
  replaceResumeId?: string | null;
  title?: string;
  clientTaskId?: string;
}) {
  await connectToDatabase();
  await failTimedOutBackgroundTasks();
  const [runningCount, startingCount] = await Promise.all([
    countActiveResumeTasks("resume_analysis"),
    countStartingResumeTasks("resume_analysis"),
  ]);
  const canStartImmediately =
    runningCount + startingCount < MAX_CONCURRENT_RESUME_TASKS;

  const task = await BackgroundTask.create({
    userId: input.userId,
    type: "resume_analysis",
    status: "pending",
    title: input.title?.trim() || "Resume analysis",
    fileName: input.fileName,
    replaceResumeId:
      input.replaceResumeId && Types.ObjectId.isValid(input.replaceResumeId)
        ? new Types.ObjectId(input.replaceResumeId)
        : null,
    stageKey: canStartImmediately ? "starting" : "queued",
    stageLabel: canStartImmediately
      ? "Starting background processing"
      : "Queued for background processing",
    progressPercent: 0,
    debugData: input.clientTaskId ? { clientTaskId: input.clientTaskId } : null,
    sourceFile: {
      buffer: input.buffer,
      mimeType: input.mimeType,
      size: input.size,
    },
    events: [
      {
        label: canStartImmediately
          ? "Starting background processing"
          : "Queued for background processing",
        tone: "info",
        createdAt: new Date(),
      },
    ],
  });

  return toSafeBackgroundTask(task);
}

export async function queueResumeReextractTaskForUser(resumeId: string, userId: string) {
  await connectToDatabase();

  if (!Types.ObjectId.isValid(resumeId)) {
    return { ok: false, error: "Invalid resume id." };
  }

  const [resume, sourceTask] = await Promise.all([
    Resume.findOne({ _id: resumeId, userId }).select("fileName").lean(),
    BackgroundTask.findOne({
      userId,
      resultResumeId: resumeId,
      type: "resume_analysis",
      "sourceFile.buffer": { $exists: true },
    })
      .sort({ createdAt: -1 })
      .select("fileName sourceFile")
      .lean(),
  ]);

  if (!resume) {
    return { ok: false, error: "Resume not found." };
  }

  if (!sourceTask?.sourceFile?.buffer?.length) {
    return {
      ok: false,
      error: "The original uploaded file is no longer available for re-extraction.",
    };
  }

  const task = await createResumeAnalysisTask({
    userId,
    fileName: sourceTask.fileName?.trim() || resume.fileName.trim(),
    mimeType: sourceTask.sourceFile.mimeType || "application/octet-stream",
    size: sourceTask.sourceFile.size || sourceTask.sourceFile.buffer.length,
    buffer: Buffer.from(sourceTask.sourceFile.buffer),
    replaceResumeId: resumeId,
    title: "Resume re-extraction",
  });

  await enqueueResumeAnalysisTask(task.id);

  return { ok: true, task };
}

export async function deleteBackgroundTaskForUser(taskId: string, userId: string) {
  await connectToDatabase();

  const task = await BackgroundTask.findOne({ _id: taskId, userId });

  if (!task) {
    return { ok: false, error: "Task not found." };
  }

  if (!["pending", "completed", "failed", "canceled"].includes(task.status)) {
    return { ok: false, error: "This task cannot be removed right now." };
  }

  await task.deleteOne();

  return { ok: true };
}

export async function cancelBackgroundTaskForUser(taskId: string, userId: string) {
  await connectToDatabase();

  const task = await BackgroundTask.findOne({ _id: taskId, userId });

  if (!task) {
    return { ok: false, error: "Task not found." };
  }

  if (!["pending", "running", "streaming"].includes(task.status)) {
    return { ok: false, error: "Only queued or active tasks can be canceled." };
  }

  const wasRunning = task.status === "running" || task.status === "streaming";
  task.status = "canceled";
  task.stageKey = "canceled";
  task.stageLabel = "Canceled";
  task.completedAt = new Date();
  task.events.push({
    label: wasRunning
      ? "Canceled while processing was in progress"
      : "Canceled before processing started",
    tone: "error",
    createdAt: new Date(),
  });
  task.processingToken = null;
  await task.save();

  return { ok: true, task: toSafeBackgroundTask(task) };
}

export async function retryBackgroundTaskForUser(taskId: string, userId: string) {
  await connectToDatabase();

  const task = await BackgroundTask.findOne({ _id: taskId, userId });

  if (!task) {
    return { ok: false, error: "Task not found." };
  }

  if (task.status !== "failed") {
    return { ok: false, error: "Only failed tasks can be retried." };
  }

  task.status = "pending";
  task.stageKey = "queued";
  task.stageLabel = "Queued for background processing";
  task.progressPercent = 0;
  task.error = null;
  task.startedAt = null;
  task.completedAt = null;
  task.processingToken = null;
  task.events.push({
    label: "Queued again",
    tone: "info",
    createdAt: new Date(),
  });
  await task.save();

  const safeTask = toSafeBackgroundTask(task);
  if (safeTask.type === "resume_tailoring") {
    await enqueueResumeTailoringTask(safeTask.id);
  } else {
    await enqueueResumeAnalysisTask(safeTask.id);
  }

  const refreshedTask = await BackgroundTask.findOne({
    _id: safeTask.id,
    userId,
  }).lean();

  return {
    ok: true,
    task: refreshedTask ? toSafeBackgroundTask(refreshedTask) : safeTask,
  };
}

export async function enqueueResumeAnalysisTask(taskId: string) {
  const bridgeUrl = normalizeBridgeUrl(process.env.TASKIQ_BRIDGE_URL);
  const internalToken = process.env.TASK_INTERNAL_TOKEN?.trim();
  const debugId = randomUUID();
  const startedAt = Date.now();

  if (!bridgeUrl) {
    if (process.env.NODE_ENV !== "production") {
      enqueueLocalTaskProcessing(taskId);
      return { mode: "local" as const, debugId };
    }

    const error = new Error(
      "TASKIQ_BRIDGE_URL is not configured in the production environment.",
    );
    await failTaskiqDispatch(taskId, debugId, "", startedAt, error);
    throw error;
  }

  if (!internalToken) {
    const error = new Error(
      "TASK_INTERNAL_TOKEN is not configured in the production environment.",
    );
    await failTaskiqDispatch(taskId, debugId, bridgeUrl, startedAt, error);
    throw error;
  }

  await recordTaskiqDispatch(
    taskId,
    {
      debugId,
      state: "contacting_bridge",
      bridgeOrigin: getSafeBridgeOrigin(bridgeUrl),
      startedAt: new Date(startedAt).toISOString(),
    },
    { label: "Contacting Taskiq bridge" },
  );

  console.info("[taskiq:dispatch] enqueue_started", {
    taskId,
    debugId,
    bridgeOrigin: getSafeBridgeOrigin(bridgeUrl),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TASKIQ_BRIDGE_TIMEOUT_MS);

  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/enqueue/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-task-internal-token": internalToken,
      },
      body: JSON.stringify({
        taskId,
        appBaseUrl: getAppBaseUrl(),
        internalToken,
        debugId,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as {
      queued?: boolean;
      taskiqId?: string | null;
      detail?: unknown;
    } | null;

    if (!response.ok) {
      const detail = payload?.detail
        ? ` ${JSON.stringify(payload.detail).slice(0, 300)}`
        : "";
      throw new Error(`Taskiq bridge returned ${response.status}.${detail}`);
    }

    if (!payload?.queued) {
      throw new Error("Taskiq bridge response did not confirm the enqueue.");
    }

    await recordTaskiqDispatch(
      taskId,
      {
        debugId,
        state: "accepted_by_bridge",
        bridgeOrigin: getSafeBridgeOrigin(bridgeUrl),
        taskiqId: payload.taskiqId ?? null,
        durationMs: Date.now() - startedAt,
      },
      { label: "Task accepted by Taskiq bridge", tone: "success" },
    );

    console.info("[taskiq:dispatch] enqueue_completed", {
      taskId,
      debugId,
      taskiqId: payload.taskiqId ?? null,
      durationMs: Date.now() - startedAt,
    });

    return {
      mode: "taskiq" as const,
      debugId,
      taskiqId: payload.taskiqId ?? null,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      logTaskiqFallback("resume", error);
      enqueueLocalTaskProcessing(taskId);
      return { mode: "local" as const, debugId };
    }

    await failTaskiqDispatch(taskId, debugId, bridgeUrl, startedAt, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function processPendingResumeAnalysisTasks(preferredTaskId?: string | null) {
  await connectToDatabase();
  await failTimedOutBackgroundTasks();

  const normalizedPreferredTaskId = preferredTaskId?.trim() || null;
  if (normalizedPreferredTaskId) {
    const reclaimedTask = await reclaimRunningResumeAnalysisTask(
      normalizedPreferredTaskId,
    );

    if (reclaimedTask) {
      console.warn("[resume-processing] reclaimed_orphaned_task", {
        taskId: reclaimedTask.id,
      });
      await processResumeAnalysisTask(
        reclaimedTask.id,
        reclaimedTask.processingToken,
      );
      await kickResumeAnalysisDispatcherIfStalled();
      return {
        dispatched: true,
        busy: false,
        processedCount: 1,
        reclaimed: true,
      };
    }
  }

  const ownerToken = randomUUID();
  const acquiredLease = await acquireBackgroundTaskDispatchLease(ownerToken);

  if (!acquiredLease) {
    return { dispatched: false, busy: true };
  }

  let claimedTasks: Array<{ id: string; processingToken: string }> = [];
  let runningCount = 0;

  try {
    runningCount = await countActiveResumeTasks("resume_analysis");
    const availableSlots = Math.max(0, MAX_CONCURRENT_RESUME_TASKS - runningCount);

    if (availableSlots > 0) {
      const nextTaskIds = await findNextPendingResumeAnalysisTaskIds(
        availableSlots,
        normalizedPreferredTaskId,
      );
      claimedTasks = await claimResumeAnalysisTasksForProcessing(nextTaskIds);
    }

    if (claimedTasks.length === 0) {
      return {
        dispatched: false,
        busy: runningCount >= MAX_CONCURRENT_RESUME_TASKS,
        processedCount: 0,
      };
    }
  } finally {
    await releaseBackgroundTaskDispatchLease(ownerToken);
  }

  const results = await Promise.allSettled(
    claimedTasks.map((task) =>
      processResumeAnalysisTask(task.id, task.processingToken),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Parallel resume task processing error:", result.reason);
    }
  }

  await kickResumeAnalysisDispatcherIfStalled();

  return { dispatched: true, busy: false, processedCount: claimedTasks.length };
}

export async function processResumeAnalysisTask(
  taskId: string,
  claimedProcessingToken?: string,
) {
  const aiUsage = createAIUsageAccumulator();
  const processingStartedAt = Date.now();
  console.info("[resume-processing] started", {
    taskId,
    hasClaimedToken: Boolean(claimedProcessingToken),
  });

  await connectToDatabase();
  await recordResumeProcessingDebug(taskId, {
    state: "database_connected",
    elapsedMs: Date.now() - processingStartedAt,
  });

  const processingToken = claimedProcessingToken || randomUUID();
  const task = claimedProcessingToken
    ? await BackgroundTask.findOne({
        _id: taskId,
        status: "running",
        processingToken,
      })
    : await claimTaskForProcessing(taskId, processingToken);

  if (!task) {
    const message =
      "The claimed background task could not be reloaded for processing.";
    console.error("[resume-processing] claimed_task_reload_failed", {
      taskId,
      elapsedMs: Date.now() - processingStartedAt,
    });
    await BackgroundTask.findByIdAndUpdate(taskId, {
      $set: {
        status: "failed",
        stageKey: "failed",
        stageLabel: "Task ownership could not be verified",
        error: message,
        completedAt: new Date(),
        processingToken: null,
        "debugData.resumeProcessing": {
          state: "claimed_task_reload_failed",
          elapsedMs: Date.now() - processingStartedAt,
          updatedAt: new Date().toISOString(),
        },
      },
      $push: {
        events: {
          label: message,
          tone: "error",
          createdAt: new Date(),
        },
      },
    });
    return null;
  }

  await recordResumeProcessingDebug(taskId, {
    state: "task_loaded",
    elapsedMs: Date.now() - processingStartedAt,
    sourceFileBytes: task.sourceFile?.buffer?.length ?? 0,
    sourceMimeType: task.sourceFile?.mimeType ?? null,
  });

  if (!task.sourceFile?.buffer?.length) {
    task.status = "failed";
    task.stageKey = "failed";
    task.stageLabel = "Source file is missing";
    task.error = "The original uploaded file is no longer available for processing.";
    task.completedAt = new Date();
    task.processingToken = null;
    task.events.push({
      label: "Source file is missing",
      tone: "error",
      createdAt: new Date(),
    });
    await task.save();
    void kickResumeAnalysisDispatcherIfStalled().catch((kickError) => {
      console.warn("Failed to promote next resume analysis task.", kickError);
    });
    return null;
  }

  try {
    await appendTaskEvent(taskId, processingToken, "Preparing your resume", "info");

    await recordResumeProcessingDebug(taskId, {
      state: "creating_file",
      elapsedMs: Date.now() - processingStartedAt,
      sourceFileBytes: task.sourceFile.buffer.length,
    });

    const file = new File(
      [new Uint8Array(task.sourceFile.buffer)],
      task.fileName,
      { type: task.sourceFile.mimeType || "application/octet-stream" },
    );

    await updateTaskStage(taskId, processingToken, "extracting_text", "Reading resume text", 10);
    await recordResumeProcessingDebug(taskId, {
      state: "extracting_text",
      elapsedMs: Date.now() - processingStartedAt,
      fileName: task.fileName,
      sourceFileBytes: task.sourceFile.buffer.length,
    });
    const rawText = await withTimeout(
      extractResumeTextFromFile(file),
      RESUME_TEXT_EXTRACTION_TIMEOUT_MS,
      "Reading resume text timed out. Please try a simpler PDF/DOCX export or upload a text-based resume file.",
    );
    await recordResumeProcessingDebug(taskId, {
      state: "text_extracted",
      elapsedMs: Date.now() - processingStartedAt,
      extractedCharacters: rawText.length,
    });
    await assertTaskCanContinue(taskId, processingToken);

    if (!rawText || rawText.length < 60) {
      throw new Error("We couldn't extract enough text from that resume.");
    }

    // ── Pre-flight text quality gate ─────────────────────────────────────────
    // Detects scan-only PDFs that produce garbled OCR garbage: high char count
    // but almost no real words (low alphanumeric density or too few tokens).
    await updateTaskStage(taskId, processingToken, "pre_flight", "Checking text quality", 16);
    const rawWordCount = rawText.trim().split(/\s+/).filter(Boolean).length;
    const alphanumCount = rawText.replace(/[^a-zA-Z0-9]/g, "").length;
    const alphanumRatio = rawText.length > 0 ? alphanumCount / rawText.length : 0;
    if (rawWordCount < 40 || alphanumRatio < 0.4) {
      throw new Error(
        "The uploaded file appears to be a scanned image or contains unreadable text. " +
        "Please export the resume as a text-based PDF or DOCX and try again.",
      );
    }

    const user = await User.findById(task.userId).select("settings").lean();

    if (!user) {
      throw new Error("User not found.");
    }

    const preferredAI = normalizeAIProvider(user.settings?.preferredAI);
    const geminiRouterIndex = normalizeGeminiRouterIndex(
      user.settings?.preferredGeminiRouterIndex,
    );
    const huggingFaceRouterIndex = normalizeHuggingFaceRouterIndex(
      user.settings?.preferredHuggingFaceRouterIndex,
    );

    let parsedData;
    let extractionMeta;

    await updateTaskStage(
      taskId,
      processingToken,
      "extracting_resume",
      "Extracting resume with AI",
      58,
    );
    await appendTaskEvent(
      taskId,
      processingToken,
      "Structuring resume sections",
      "info",
    );

    try {
      // Single-shot AI extraction. This runs as one provider call so the whole
      // resume is structured well within the background worker's acknowledgement
      // window. For OpenAI the call streams and aggregates token deltas (with a
      // non-streaming fallback) to keep latency low.
      parsedData = await runWithAIUsage(aiUsage, () => withTimeout(
        parseResumeWithAI(
          rawText,
          preferredAI,
          { geminiRouterIndex, huggingFaceRouterIndex },
          {
            onRetry: () => {
              // Fire-and-forget — surface the retry in the task timeline so
              // users see movement instead of a frozen bar during the second call.
              void updateTaskStage(
                taskId,
                processingToken,
                "extraction_retry",
                "Retrying extraction",
                64,
              ).catch(() => {});
              void appendTaskEvent(
                taskId,
                processingToken,
                "AI response was incomplete — retrying extraction",
                "info",
              ).catch(() => {});
            },
          },
        ),
        getResumeExtractionTimeoutMs(preferredAI),
        `${preferredAI} resume extraction timed out.`,
      ));
      extractionMeta = createAIOnlyResumeExtractionMeta();

      const parseConfidence = assessResumeParseConfidence(parsedData);

      if (!parseConfidence.isConfident) {
        await appendTaskEvent(
          taskId,
          processingToken,
          `AI extraction confidence ${parseConfidence.score}% — checking local summary and skills`,
          "info",
        );

        const localParsedData = parseResumeFallback(rawText);
        const localSummary = extractLocalSummaryCandidate(rawText);
        const localSkills = extractLocalSkillsCandidate(rawText);
        const updatedAt = new Date().toISOString();

        if (
          localParsedData.personalInfo.name ||
          localParsedData.personalInfo.title ||
          localParsedData.personalInfo.email ||
          localParsedData.personalInfo.phone ||
          localParsedData.personalInfo.location ||
          localParsedData.personalInfo.links.length
        ) {
          const previousProfile = parsedData.personalInfo;
          parsedData.personalInfo = {
            ...previousProfile,
            name: previousProfile.name || localParsedData.personalInfo.name,
            title: previousProfile.title || localParsedData.personalInfo.title,
            email: previousProfile.email || localParsedData.personalInfo.email,
            phone: previousProfile.phone || localParsedData.personalInfo.phone,
            location: previousProfile.location || localParsedData.personalInfo.location,
            links: previousProfile.links.length
              ? previousProfile.links
              : localParsedData.personalInfo.links,
          };
          extractionMeta.sections.personalInfo = {
            source: "merged",
            confidence: Math.max(72, parseConfidence.score),
            updatedAt,
            issues: [
              `AI parse confidence was ${parseConfidence.score}%. Local header fields filled missing profile data.`,
            ],
          };
        }

        if (
          localSummary &&
          (
            !parsedData.summary ||
            parsedData.summary.length + 30 < localSummary.length
          )
        ) {
          parsedData.summary = localSummary;
          extractionMeta.sections.summary = {
            source: "local",
            confidence: Math.max(72, parseConfidence.score),
            updatedAt,
            issues: [
              `AI parse confidence was ${parseConfidence.score}%. Local summary block was more complete.`,
            ],
          };
        }

        if (
          localSkills.length > 0 &&
          (
            parsedData.skills.length === 0 ||
            parsedData.skills.length + 2 < localSkills.length ||
            (
              localSkills.some((skill) => skill.includes(":")) &&
              !parsedData.skills.some((skill) => skill.includes(":"))
            )
          )
        ) {
          parsedData.skills = localSkills;
          extractionMeta.sections.skills = {
            source: "local",
            confidence: Math.max(72, parseConfidence.score),
            updatedAt,
            issues: [
              `AI parse confidence was ${parseConfidence.score}%. Local grouped skills were more complete.`,
            ],
          };
        }
      }
    } catch (aiError) {
      // AI extraction failed (timeout, provider error, empty result). Fall back
      // to the local heuristic parser so the task always completes with
      // something useful rather than failing with no data at all.
      console.warn(
        `${preferredAI} resume parsing failed — falling back to local parser.`,
        aiError,
      );

      await assertTaskCanContinue(taskId, processingToken);
      await appendTaskEvent(
        taskId,
        processingToken,
        "AI extraction failed — using local parser",
        "info",
      );

      try {
        parsedData = parseResumeFallback(rawText);
      } catch (fallbackError) {
        // Even the local parser failed. Fail the task with the original AI error.
        console.warn("Local resume parser also failed.", fallbackError);
        throw aiError instanceof Error
          ? aiError
          : new Error("Resume extraction failed.");
      }

      // Mark every section as locally-extracted with reduced confidence.
      const fallbackMeta = createEmptyResumeExtractionMeta();
      fallbackMeta.rawTextAvailable = true;
      const updatedAt = new Date().toISOString();
      for (const section of RESUME_SECTION_KEYS) {
        fallbackMeta.sections[section] = {
          source: "local",
          confidence: 50,
          updatedAt,
          issues: [`AI extraction failed (${preferredAI}). Used local parser.`],
        };
      }
      extractionMeta = fallbackMeta;
    }

    await assertTaskCanContinue(taskId, processingToken);

    // Compute the extraction audit once here so it can be passed directly into
    // analyzeResumeWithAI — this avoids the internal duplicate call that
    // stabilizeAnalysisReport would otherwise make.
    const parseConfidence = assessResumeParseConfidence(parsedData);
    const extractionAudit = parseConfidence.isConfident
      ? {
          personalInfo: [],
          summary: [],
          skills: [],
          experience: [],
          education: [],
        }
      : auditResumeExtraction(parsedData, rawText);

    await updateTaskStage(taskId, processingToken, "analyzing_resume", "Running final analysis", 82);

    let analysisReport;

    try {
      analysisReport = await runWithAIUsage(aiUsage, () => withTimeout(
        analyzeResumeWithAI(
          parsedData,
          rawText,
          preferredAI,
          { geminiRouterIndex, huggingFaceRouterIndex },
          extractionAudit,
        ),
        RESUME_ANALYSIS_AI_TIMEOUT_MS,
        `${preferredAI} resume analysis timed out.`,
      ));
    } catch (error) {
      console.warn(`${preferredAI} resume analysis failed.`, error);
      throw error instanceof Error
        ? error
        : new Error("Resume analysis failed.");
    }
    await assertTaskCanContinue(taskId, processingToken);

    await updateTaskStage(taskId, processingToken, "saving_result", "Finalizing your report", 92);

    const inferredCountry = inferCountryCodeFromResume(parsedData);

    const resume =
      task.replaceResumeId && Types.ObjectId.isValid(task.replaceResumeId)
        ? await Resume.findOneAndUpdate(
            { _id: task.replaceResumeId, userId: task.userId },
            {
              fileName: task.fileName.trim(),
              originalUrl: null,
              rawText,
              parsedData,
              analysisReport,
              extractionMeta,
              aiUsage,
            },
            {
              returnDocument: "after",
              upsert: false,
            },
          )
        : null;

    const finalizedResume =
      resume ??
      (await Resume.create({
        userId: task.userId,
        fileName: task.fileName.trim(),
        originalUrl: null,
        rawText,
        parsedData,
        analysisReport,
        extractionMeta,
        aiUsage,
      }));

    if (inferredCountry) {
      try {
        await User.findByIdAndUpdate(task.userId, {
          country: inferredCountry,
        });
      } catch (error) {
        console.warn("Country sync after resume upload failed.", error);
      }
    }
    await assertTaskCanContinue(taskId, processingToken);

    task.status = "completed";
    task.stageKey = "completed";
    task.stageLabel = "Resume analysis ready";
    task.progressPercent = 100;
    task.resultResumeId = finalizedResume._id as Types.ObjectId;
    task.error = null;
    task.completedAt = new Date();
    task.processingToken = null;
    task.events.push({
      label: "Resume analysis ready",
      tone: "success",
      createdAt: new Date(),
    });
    await task.save();

    return {
      task: toSafeBackgroundTask(task),
      resume: toSafeResume(finalizedResume),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message === TASK_CANCELED_MESSAGE ||
        error.message === TASK_REMOVED_MESSAGE ||
        error.message === TASK_OWNERSHIP_LOST_MESSAGE
      )
    ) {
      return null;
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Something went wrong while processing the background task.";

    const failedTask = await BackgroundTask.findOneAndUpdate(
      { _id: taskId, processingToken },
      {
        status: "failed",
        stageKey: "failed",
        stageLabel: "Task failed",
        error: errorMessage,
        completedAt: new Date(),
        processingToken: null,
        $push: {
          events: {
            label: errorMessage,
            tone: "error",
            createdAt: new Date(),
          },
        },
      },
      { returnDocument: "after" },
    );

    if (!failedTask) {
      console.warn("[resume-processing] stale_failure_ignored", {
        taskId,
        error: errorMessage,
      });
      return null;
    }

    return {
      task: toSafeBackgroundTask(failedTask),
      resume: null,
    };
  } finally {
    void kickResumeAnalysisDispatcherIfStalled().catch((kickError) => {
      console.warn("Failed to promote next resume analysis task.", kickError);
    });
  }
}

export async function getBackgroundTaskForUser(taskId: string, userId: string) {
  await connectToDatabase();
  await failTimedOutBackgroundTasks();
  await Promise.all([
    kickResumeAnalysisDispatcherIfStalled(taskId),
    kickResumeTailoringDispatcherIfStalled(taskId),
  ]);
  const task = await BackgroundTask.findOne({ _id: taskId, userId }).lean();
  return task ? toSafeBackgroundTask(task) : null;
}

// ─── Resume Tailoring Tasks ────────────────────────────────────────────────────

const BACKGROUND_TAILORING_DISPATCH_LEASE_KEY = "resume-tailoring-dispatch";

async function acquireResumeTailoringDispatchLease(ownerToken: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BACKGROUND_TASK_DISPATCH_LEASE_MS);

  try {
    const lease = await BackgroundTaskLease.findOneAndUpdate(
      {
        key: BACKGROUND_TAILORING_DISPATCH_LEASE_KEY,
        $or: [{ expiresAt: { $lte: now } }, { ownerToken }],
      },
      { key: BACKGROUND_TAILORING_DISPATCH_LEASE_KEY, ownerToken, expiresAt },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    return lease?.ownerToken === ownerToken;
  } catch (error) {
    if (isBackgroundTaskLeaseConflict(error)) {
      return false;
    }
    throw error;
  }
}

async function releaseResumeTailoringDispatchLease(ownerToken: string) {
  await BackgroundTaskLease.deleteOne({
    key: BACKGROUND_TAILORING_DISPATCH_LEASE_KEY,
    ownerToken,
  });
}

export async function createResumeTailoringTask(input: {
  userId: string;
  resumeId: string;
  resumeFileName: string;
  jobDescriptionContent: string;
  savedJobDescriptionId?: string | null;
  jobTitle?: string;
  jobCompany?: string;
  clientTaskId?: string | null;
}) {
  await connectToDatabase();
  await failTimedOutBackgroundTasks();
  const [runningCount, startingCount] = await Promise.all([
    countActiveResumeTasks("resume_tailoring"),
    countStartingResumeTasks("resume_tailoring"),
  ]);
  const canStartImmediately =
    runningCount + startingCount < MAX_CONCURRENT_RESUME_TASKS;

  const task = await BackgroundTask.create({
    userId: input.userId,
    type: "resume_tailoring",
    status: "pending",
    title: "Resume tailoring",
    fileName: input.resumeFileName,
    stageKey: canStartImmediately ? "starting" : "queued",
    stageLabel: canStartImmediately ? "Starting tailoring" : "Queued for tailoring",
    progressPercent: canStartImmediately ? 2 : 0,
    debugData: input.clientTaskId ? { clientTaskId: input.clientTaskId } : null,
    tailoringPayload: {
      resumeId: new Types.ObjectId(input.resumeId),
      savedJobDescriptionId:
        input.savedJobDescriptionId && Types.ObjectId.isValid(input.savedJobDescriptionId)
          ? new Types.ObjectId(input.savedJobDescriptionId)
          : null,
      jobDescriptionContent: input.jobDescriptionContent,
      jobTitle: input.jobTitle ?? "",
      jobCompany: input.jobCompany ?? "",
    },
    events: [
      {
        label: canStartImmediately ? "Starting tailoring" : "Queued for tailoring",
        tone: "info",
        createdAt: new Date(),
      },
    ],
  });

  return toSafeBackgroundTask(task);
}

export async function enqueueResumeTailoringTask(taskId: string) {
  const bridgeUrl = normalizeBridgeUrl(process.env.TASKIQ_BRIDGE_URL);
  const internalToken = process.env.TASK_INTERNAL_TOKEN?.trim();
  const debugId = randomUUID();
  const startedAt = Date.now();

  if (!bridgeUrl) {
    if (process.env.NODE_ENV !== "production") {
      enqueueLocalResumeTailoringProcessing(taskId);
      return { mode: "local" as const, debugId };
    }

    const error = new Error(
      "TASKIQ_BRIDGE_URL is not configured in the production environment.",
    );
    await failTaskiqDispatch(taskId, debugId, "", startedAt, error);
    throw error;
  }

  if (!internalToken) {
    const error = new Error(
      "TASK_INTERNAL_TOKEN is not configured in the production environment.",
    );
    await failTaskiqDispatch(taskId, debugId, bridgeUrl, startedAt, error);
    throw error;
  }

  await recordTaskiqDispatch(
    taskId,
    {
      debugId,
      state: "contacting_bridge",
      bridgeOrigin: getSafeBridgeOrigin(bridgeUrl),
      startedAt: new Date(startedAt).toISOString(),
    },
    { label: "Contacting Taskiq bridge" },
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TASKIQ_BRIDGE_TIMEOUT_MS);

  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/enqueue/tailor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-task-internal-token": internalToken,
      },
      body: JSON.stringify({
        taskId,
        appBaseUrl: getAppBaseUrl(),
        internalToken,
        debugId,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as {
      queued?: boolean;
      taskiqId?: string | null;
      detail?: unknown;
    } | null;

    if (!response.ok) {
      const detail = payload?.detail
        ? ` ${JSON.stringify(payload.detail).slice(0, 300)}`
        : "";
      throw new Error(`Taskiq bridge returned ${response.status}.${detail}`);
    }

    if (!payload?.queued) {
      throw new Error("Taskiq bridge response did not confirm the enqueue.");
    }

    await recordTaskiqDispatch(
      taskId,
      {
        debugId,
        state: "accepted_by_bridge",
        bridgeOrigin: getSafeBridgeOrigin(bridgeUrl),
        taskiqId: payload.taskiqId ?? null,
        durationMs: Date.now() - startedAt,
      },
      { label: "Task accepted by Taskiq bridge", tone: "success" },
    );

    return {
      mode: "taskiq" as const,
      debugId,
      taskiqId: payload.taskiqId ?? null,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      logTaskiqFallback("tailoring", error);
      enqueueLocalResumeTailoringProcessing(taskId);
      return { mode: "local" as const, debugId };
    }

    await failTaskiqDispatch(taskId, debugId, bridgeUrl, startedAt, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function processPendingResumeTailoringTasks(preferredTaskId?: string | null) {
  await connectToDatabase();
  await failTimedOutBackgroundTasks();

  const ownerToken = randomUUID();
  const acquiredLease = await acquireResumeTailoringDispatchLease(ownerToken);

  if (!acquiredLease) {
    return { dispatched: false, busy: true };
  }

  let nextTaskIds: string[] = [];

  try {
    const runningCount = await countActiveResumeTasks("resume_tailoring");
    const availableSlots = Math.max(0, MAX_CONCURRENT_RESUME_TASKS - runningCount);

    if (availableSlots > 0) {
      nextTaskIds = await findNextPendingResumeTailoringTaskIds(
        availableSlots,
        preferredTaskId?.trim() || null,
      );
    }

    if (nextTaskIds.length === 0) {
      return {
        dispatched: false,
        busy: runningCount >= MAX_CONCURRENT_RESUME_TASKS,
        processedCount: 0,
      };
    }
  } finally {
    await releaseResumeTailoringDispatchLease(ownerToken);
  }

  const results = await Promise.allSettled(
    nextTaskIds.map((id) => processResumeTailoringTask(id)),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Parallel tailoring task processing error:", result.reason);
    }
  }

  await kickResumeTailoringDispatcherIfStalled();

  return { dispatched: true, busy: false, processedCount: nextTaskIds.length };
}

export async function processResumeTailoringTask(taskId: string) {
  await connectToDatabase();

  const processingToken = randomUUID();
  const task = await claimTaskForProcessing(taskId, processingToken);

  if (!task) return null;

  if (!task.tailoringPayload?.resumeId) {
    task.status = "failed";
    task.stageKey = "failed";
    task.stageLabel = "Tailoring payload is missing";
    task.error = "The tailoring task is missing the required resume reference.";
    task.completedAt = new Date();
    task.processingToken = null;
    task.events.push({ label: "Tailoring payload is missing", tone: "error", createdAt: new Date() });
    await task.save();
    return null;
  }

  // Accumulated debug data for the tailoring pipeline — written to DB in one
  // shot at the validation step so every panel in the debug UI is populated.
  const pipelineDebug: Record<string, unknown> = {};
  const aiUsage = createAIUsageAccumulator();

  try {
    // Race the whole pipeline against an overall budget so no single hung step
    // (AI provider, DB, or unexpected stall) can leave the task running until
    // the serverless function is force-killed. On timeout this rejects and the
    // catch below marks the task failed with a clear message.
    const pipelineResult = await withTimeout(
      (async () => {
    // ── Step 1: Load resume and user settings ─────────────────────────────────
    await updateTaskStage(taskId, processingToken, "loading_resume", "Loading your resume", 10);

    const [resume, user] = await Promise.all([
      Resume.findOne({ _id: task.tailoringPayload.resumeId, userId: task.userId }).lean(),
      User.findById(task.userId).select("settings").lean(),
    ]);

    if (!resume) throw new Error("Resume not found.");
    if (!user) throw new Error("User not found.");

    await assertTaskCanContinue(taskId, processingToken);

    const preferredAI = normalizeAIProvider(user.settings?.preferredAI);
    const geminiRouterIndex = normalizeGeminiRouterIndex(user.settings?.preferredGeminiRouterIndex);
    const huggingFaceRouterIndex = normalizeHuggingFaceRouterIndex(
      user.settings?.preferredHuggingFaceRouterIndex,
    );

    pipelineDebug.provider = preferredAI;

    // Clip the JD once up front so every downstream synchronous parser
    // (keyword extraction, JD summary parsing, quality validation) works on a
    // bounded input — an oversized or pathological description can otherwise
    // stall the event loop at an unpredictable step.
    const jobDescriptionContent = clipResumePromptText(
      task.tailoringPayload.jobDescriptionContent ?? "",
    );

    // ── Step 2: Derive lightweight JD signals locally (no AI cost) ────────────
    // We no longer run a separate AI "analyze job description" pass — it added a
    // full extra LLM round-trip (and its large output) for little quality gain,
    // since the single tailoring call (Step 3) reads the raw job description
    // directly. Instead we parse the JD deterministically here (free) and reuse
    // any analysis that was already computed and stored when the JD was saved.
    await updateTaskStage(taskId, processingToken, "analyzing_job_description", "Reviewing job description", 25);

    let analyzedJobDescription: ReturnType<typeof normalizeAnalyzedJobDescription> | null = null;

    if (task.tailoringPayload.savedJobDescriptionId) {
      const savedJd = await JobDescription.findOne({
        _id: task.tailoringPayload.savedJobDescriptionId,
        userId: task.userId,
      }).select("analyzedJobDescription").lean();
      analyzedJobDescription = savedJd?.analyzedJobDescription ?? null;
    }

    // No stored analysis → parse the JD deterministically (no tokens spent).
    if (!analyzedJobDescription) {
      analyzedJobDescription = normalizeAnalyzedJobDescription(null, jobDescriptionContent, {
        title: task.tailoringPayload.jobTitle ?? "",
        company: task.tailoringPayload.jobCompany ?? "",
      });
    }

    // Record JD analysis result for debug panel
    pipelineDebug.jobDescriptionAnalysis = analyzedJobDescription;

    // Record the parsed (already-analysed) resume for the debug panel. This is
    // the same compact data we send to the model — we no longer attach the raw
    // resume text or the full analysis report to the prompt (they cost a lot of
    // tokens for little tailoring benefit).
    pipelineDebug.originalResumeAnalysis = {
      fileName: resume.fileName ?? "",
      parsedData: resume.parsedData,
    };

    // ── Step 3: Prompt Construction + LLM Call ────────────────────────────────
    await updateTaskStage(taskId, processingToken, "tailoring", `Tailoring your resume with ${preferredAI}`, 50);

    let tailoredData = resume.parsedData;
    let aiModelUsed: string = preferredAI;

    try {
      // Cost-effective tailoring: a single AI call receives only the
      // already-parsed resume + the job description. The raw resume text and
      // the full analysis report are intentionally omitted from the prompt.
      tailoredData = await runWithAIUsage(aiUsage, () => withTimeout(
        tailorResume(
          resume.parsedData,
          jobDescriptionContent,
          preferredAI,
          { geminiRouterIndex, huggingFaceRouterIndex },
          {
            analyzedJobDescription,
          },
        ),
        RESUME_TAILORING_AI_TIMEOUT_MS,
        `${preferredAI} tailoring timed out.`,
      ));
      aiModelUsed = preferredAI;
    } catch (tailorError) {
      // LLM call failed entirely — use deterministic fallback so task still completes
      const errMsg = tailorError instanceof Error ? tailorError.message : `${preferredAI} tailoring failed.`;
      console.warn(`${preferredAI} tailoring failed, using deterministic fallback.`, tailorError);
      pipelineDebug.tailoringError = errMsg;
      tailoredData = tailorResumeFallback(resume.parsedData, jobDescriptionContent);
      aiModelUsed = `${preferredAI}-fallback`;
    }

    // Record final tailored output for debug panel
    pipelineDebug.aiModelUsed = aiModelUsed;
    pipelineDebug.tailoredResult = tailoredData;

    // ── Step 4: Post-Processing + Quality Validation (warning only) ───────────
    await updateTaskStage(taskId, processingToken, "validating", "Running quality checks", 80);

    const validationResult = validateTailoredResumeQuality(
      resume.parsedData,
      tailoredData,
      jobDescriptionContent,
      analyzedJobDescription,
    );

    pipelineDebug.validation = validationResult;
    pipelineDebug.aiUsage = { ...aiUsage };

    // Write accumulated debug data + token usage in a single DB update. The
    // usage snapshot is surfaced on the task card so the cost of each tailoring
    // run is visible without opening the debug panel.
    await BackgroundTask.findOneAndUpdate(
      { _id: taskId, processingToken },
      {
        $set: {
          "debugData.tailoringPipeline": pipelineDebug,
          "debugData.aiUsage": { ...aiUsage },
        },
      },
    );

    // ── Step 5: Result Storage ─────────────────────────────────────────────────
    await assertTaskCanContinue(taskId, processingToken);
    await updateTaskStage(taskId, processingToken, "saving", "Saving your tailored resume", 90);

    // Derive title / company / keywords from AI analysis when not provided explicitly
    const resolvedTitle =
      task.tailoringPayload.jobTitle?.trim() ||
      analyzedJobDescription?.roleTitle?.trim() ||
      "";
    const resolvedCompany =
      task.tailoringPayload.jobCompany?.trim() ||
      analyzedJobDescription?.companyName?.trim() ||
      "";
    // Prefer any AI-surfaced keywords (present when a saved JD analysis is
    // reused); otherwise use the locally-parsed signals, falling back to the
    // deterministic extractor so the stored JD always has usable keywords.
    const analyzedKeywords = analyzedJobDescription
      ? [
          ...(analyzedJobDescription.atsKeywords ?? []),
          ...(analyzedJobDescription.keywordPriorities ?? []),
          ...(analyzedJobDescription.technicalSkills ?? []),
          ...(analyzedJobDescription.requiredSkills ?? []),
          ...(analyzedJobDescription.keywords ?? []),
        ]
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 60)
      : [];
    const resolvedKeywords = analyzedKeywords.length
      ? Array.from(new Set(analyzedKeywords))
      : extractKeywordCandidates(jobDescriptionContent);

    // Create or reuse the job description record
    let jobDescriptionId: Types.ObjectId | null =
      task.tailoringPayload.savedJobDescriptionId ?? null;

    if (jobDescriptionId) {
      // Backfill title / company / analyzed data on the saved JD if they were missing
      void JobDescription.findOneAndUpdate(
        {
          _id: jobDescriptionId,
          userId: task.userId,
          $or: [{ title: "" }, { title: null }, { analyzedJobDescription: null }],
        },
        {
          $set: {
            ...(resolvedTitle ? { title: resolvedTitle } : {}),
            ...(resolvedCompany ? { company: resolvedCompany } : {}),
            ...(analyzedJobDescription ? { analyzedJobDescription, parsedKeywords: resolvedKeywords } : {}),
          },
        },
      ).catch((err) => console.warn("JD backfill failed", err));
    } else if (jobDescriptionContent.trim()) {
      const jd = await JobDescription.create({
        userId: task.userId,
        title: resolvedTitle,
        company: resolvedCompany,
        content: jobDescriptionContent.trim(),
        parsedKeywords: resolvedKeywords,
        analyzedJobDescription,
      });
      jobDescriptionId = jd._id as Types.ObjectId;
    }

    const generation = await Generation.create({
      userId: task.userId,
      sourceResumeId: resume._id,
      jobDescriptionId: jobDescriptionId ?? null,
      tailoredData,
      editorDocumentStyle: createInitialTailoredResumeDocumentStyle(),
      editorTemplateId: "base",
      aiModelUsed,
      aiUsage,
      generatedFiles: { pdfUrl: null, docxUrl: null },
    });

    await assertTaskCanContinue(taskId, processingToken);

    task.status = "completed";
    task.stageKey = "completed";
    task.stageLabel = aiModelUsed.endsWith("-fallback")
      ? "Tailored resume ready (fallback)"
      : `Tailored resume ready (${aiModelUsed})`;
    task.progressPercent = 100;
    task.resultGenerationId = generation._id as Types.ObjectId;
    task.error = null;
    task.completedAt = new Date();
    task.processingToken = null;
    task.events.push({ label: "Tailored resume ready", tone: "success", createdAt: new Date() });
    await task.save();

    return {
      task: toSafeBackgroundTask(task),
      generation: toSafeGeneration(generation),
    };
      })(),
      RESUME_TAILORING_PIPELINE_BUDGET_MS,
      "Resume tailoring timed out before it could finish.",
    );

    return pipelineResult;
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message === TASK_CANCELED_MESSAGE ||
        error.message === TASK_REMOVED_MESSAGE ||
        error.message === TASK_OWNERSHIP_LOST_MESSAGE
      )
    ) {
      return null;
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Something went wrong while tailoring the resume.";

    task.status = "failed";
    task.stageKey = "failed";
    task.stageLabel = "Tailoring failed";
    task.error = errorMessage;
    task.completedAt = new Date();
    task.processingToken = null;
    task.events.push({ label: errorMessage, tone: "error", createdAt: new Date() });
    await task.save();

    return { task: toSafeBackgroundTask(task), generation: null };
  }
}
