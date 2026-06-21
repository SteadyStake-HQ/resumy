import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import {
  processPendingResumeAnalysisTasks,
  processPendingResumeTailoringTasks,
} from "@/lib/background-task-service";
import BackgroundTask from "@/models/BackgroundTask";

export const runtime = "nodejs";
export const maxDuration = 300;

function getErrorDetails(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;
  const message = error instanceof Error ? error.message : String(error);

  return {
    name: error instanceof Error ? error.name : typeof error,
    code: typeof record?.code === "string" ? record.code : null,
    message: message
      .replace(
        /((?:postgres(?:ql)?|redis(?:s)?):\/\/)[^@\s]+@/gi,
        "$1[credentials redacted]@",
      )
      .slice(0, 1000),
  };
}

async function updateCallbackDebug(
  taskId: string,
  debugData: Record<string, unknown>,
  event?: { label: string; tone: "info" | "success" | "error" },
) {
  await BackgroundTask.findByIdAndUpdate(taskId, {
    $set: {
      "debugData.taskiqWorkerCallback": {
        ...debugData,
        updatedAt: new Date().toISOString(),
      },
    },
    ...(event
      ? {
          $push: {
            events: {
              ...event,
              createdAt: new Date(),
            },
          },
        }
      : {}),
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let taskId = "";
  let currentStep = "authenticate_callback";
  let debugId = request.headers.get("x-task-debug-id")?.trim() || randomUUID();

  const log = (
    status: "started" | "completed" | "failed",
    details: Record<string, unknown> = {},
  ) => {
    console.info("[taskiq:callback]", {
      debugId,
      taskId: taskId || null,
      step: currentStep,
      status,
      elapsedMs: Date.now() - startedAt,
      ...details,
    });
  };

  log("started");

  try {
    const internalToken = process.env.TASK_INTERNAL_TOKEN?.trim();
    const providedToken = request.headers
      .get("x-task-internal-token")
      ?.trim();

    if (!internalToken || providedToken !== internalToken) {
      log("failed", { reason: "unauthorized" });
      return NextResponse.json(
        {
          error: "Unauthorized.",
          code: "task_callback_unauthorized",
          debug: { debugId, failedStep: currentStep },
        },
        { status: 401 },
      );
    }

    log("completed");
    currentStep = "parse_callback_body";
    log("started");

    const body = (await request.json().catch(() => null)) as {
      taskId?: string;
      debugId?: string;
    } | null;
    taskId = body?.taskId?.trim() || "";
    debugId = body?.debugId?.trim() || debugId;

    if (!taskId) {
      log("failed", { reason: "missing_task_id" });
      return NextResponse.json(
        {
          error: "Task id is required.",
          code: "task_id_missing",
          debug: { debugId, failedStep: currentStep },
        },
        { status: 400 },
      );
    }

    log("completed");
    currentStep = "connect_database";
    log("started");
    await connectToDatabase();
    log("completed");

    currentStep = "load_task";
    log("started");
    const task = await BackgroundTask.findById(taskId).select("type").lean();

    if (!task) {
      log("failed", { reason: "task_not_found" });
      return NextResponse.json(
        {
          error: "Task not found.",
          code: "task_not_found",
          debug: { debugId, taskId, failedStep: currentStep },
        },
        { status: 404 },
      );
    }

    log("completed", { taskType: task.type });
    await updateCallbackDebug(
      taskId,
      {
        debugId,
        state: "received",
        receivedAt: new Date().toISOString(),
      },
      { label: "Taskiq worker callback received", tone: "success" },
    );

    currentStep = "process_task";
    log("started", { taskType: task.type });
    const result =
      task.type === "resume_tailoring"
        ? await processPendingResumeTailoringTasks(taskId)
        : await processPendingResumeAnalysisTasks(taskId);
    log("completed", result);

    await updateCallbackDebug(taskId, {
      debugId,
      state: "completed",
      durationMs: Date.now() - startedAt,
      result,
    });

    return NextResponse.json({
      success: true,
      debugId,
      dispatched: result.dispatched,
      processedCount: result.processedCount ?? 0,
      busy: result.busy,
    });
  } catch (error) {
    const details = getErrorDetails(error);
    log("failed", { error: details });
    console.error("[taskiq:callback] unhandled_error", {
      debugId,
      taskId: taskId || null,
      failedStep: currentStep,
      elapsedMs: Date.now() - startedAt,
      error: details,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (taskId) {
      try {
        await updateCallbackDebug(
          taskId,
          {
            debugId,
            state: "failed",
            failedStep: currentStep,
            durationMs: Date.now() - startedAt,
            error: details,
          },
          {
            label: `Worker callback failed at ${currentStep}: ${details.message}`,
            tone: "error",
          },
        );
      } catch (debugError) {
        console.error("[taskiq:callback] debug_update_failed", debugError);
      }
    }

    return NextResponse.json(
      {
        error: "Background task callback failed.",
        code: "task_callback_failed",
        debug: {
          debugId,
          taskId: taskId || null,
          failedStep: currentStep,
          error: details,
        },
      },
      { status: 500 },
    );
  }
}
