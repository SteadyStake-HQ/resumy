import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import {
  processPendingResumeAnalysisTasks,
  processPendingResumeTailoringTasks,
} from "@/lib/background-task-service";
import BackgroundTask from "@/models/BackgroundTask";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const internalToken = process.env.TASK_INTERNAL_TOKEN?.trim();
  const providedToken = request.headers.get("x-task-internal-token")?.trim();

  if (!internalToken || providedToken !== internalToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    taskId?: string;
  } | null;
  const taskId = body?.taskId?.trim();

  if (!taskId) {
    return NextResponse.json({ error: "Task id is required." }, { status: 400 });
  }

  // Determine which dispatcher to use based on the task type
  await connectToDatabase();
  const taskType = await BackgroundTask.findById(taskId).select("type").lean();
  const type = taskType?.type ?? "resume_analysis";

  const result =
    type === "resume_tailoring"
      ? await processPendingResumeTailoringTasks(taskId)
      : await processPendingResumeAnalysisTasks(taskId);

  return NextResponse.json({
    success: true,
    dispatched: result.dispatched,
    processedCount: result.processedCount ?? 0,
    busy: result.busy,
  });
}
