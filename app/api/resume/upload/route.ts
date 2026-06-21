import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  createResumeAnalysisTask,
  enqueueResumeAnalysisTask,
  getBackgroundTaskForUser,
} from "@/lib/background-task-service";
import {
  readUploadClientTaskId,
  readUploadedFileFromRequest,
} from "@/lib/file-upload";

const MAX_RESUME_FILE_SIZE = 8 * 1024 * 1024;

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const file = await readUploadedFileFromRequest(request, {
      maxFileSize: MAX_RESUME_FILE_SIZE,
      sizeError: "Resume files must be 8 MB or smaller.",
      missingFileError: "Please upload a PDF or DOCX file.",
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const clientTaskId = readUploadClientTaskId(request);
    const task = await createResumeAnalysisTask({
      userId: session.user.id,
      fileName: file.name.trim(),
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      buffer,
      clientTaskId,
    });

    try {
      const dispatch = await enqueueResumeAnalysisTask(task.id);
      const dispatchedTask =
        (await getBackgroundTaskForUser(task.id, session.user.id)) ?? task;

      return NextResponse.json(
        { task: dispatchedTask, dispatch },
        { status: 202 },
      );
    } catch (error) {
      const failedTask = await getBackgroundTaskForUser(
        task.id,
        session.user.id,
      );

      console.error("[taskiq:upload] enqueue_failed", {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json(
        {
          error:
            "The resume was uploaded, but the background worker could not be reached.",
          code: "taskiq_enqueue_failed",
          task: failedTask,
        },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Resume upload queue error", error);

    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong while queueing the resume.";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
