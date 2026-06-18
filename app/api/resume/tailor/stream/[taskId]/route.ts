import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBackgroundTaskForUser } from "@/lib/background-task-service";
import { buildEditorSectionsFromResume } from "@/lib/editor-document";
import { toSafeGeneration } from "@/lib/generation";
import { connectToDatabase } from "@/lib/db";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

const POLL_INTERVAL_MS = 350;
const MAX_STREAM_WAIT_MS = 8 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSectionKey(sectionHtml: string, fallback: string) {
  return sectionHtml.match(/data-tailor-section="([^"]+)"/)?.[1] ?? fallback;
}

function sse(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const { taskId } = await context.params;

  if (!taskId || !Types.ObjectId.isValid(taskId)) {
    return new Response("Invalid task id.", { status: 400 });
  }

  const task = await getBackgroundTaskForUser(taskId, session.user.id);

  if (!task) {
    return new Response("Task not found.", { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      let lastStatus = "";
      let lastProgress = -1;

      try {
        sse(controller, encoder, {
          type: "status",
          status: task.status,
          progress: task.progressPercent,
          task,
        });

        while (Date.now() - startedAt < MAX_STREAM_WAIT_MS) {
          const currentTask = await getBackgroundTaskForUser(taskId, session.user.id);

          if (!currentTask) {
            sse(controller, encoder, {
              type: "error",
              message: "The tailoring task could not be found.",
            });
            break;
          }

          if (
            currentTask.status !== lastStatus ||
            currentTask.progressPercent !== lastProgress
          ) {
            lastStatus = currentTask.status;
            lastProgress = currentTask.progressPercent;
            sse(controller, encoder, {
              type: "status",
              status: currentTask.status,
              progress: currentTask.progressPercent,
              task: currentTask,
            });
          }

          if (currentTask.status === "failed" || currentTask.status === "canceled") {
            sse(controller, encoder, {
              type: currentTask.status === "failed" ? "error" : "canceled",
              message: currentTask.error ?? currentTask.stageLabel,
              task: currentTask,
            });
            break;
          }

          if (currentTask.status === "completed" && currentTask.resultGenerationId) {
            await connectToDatabase();

            const generation = await Generation.findOne({
              _id: currentTask.resultGenerationId,
              userId: session.user.id,
            }).lean();

            if (!generation) {
              sse(controller, encoder, {
                type: "error",
                message: "The tailored resume was saved, but could not be loaded.",
                task: currentTask,
              });
              break;
            }

            sse(controller, encoder, {
              type: "status",
              status: "streaming",
              progress: 92,
              task: currentTask,
            });

            const sections = buildEditorSectionsFromResume(generation.tailoredData);
            const editorHtml = sections.join("");
            for (const [index, html] of sections.entries()) {
              sse(controller, encoder, {
                type: "section",
                section: getSectionKey(html, `section-${index + 1}`),
                html,
              });
            }

            const [sourceResume, jobDescription] = await Promise.all([
              Resume.findById(generation.sourceResumeId).select("fileName").lean(),
              generation.jobDescriptionId
                ? JobDescription.findById(generation.jobDescriptionId)
                    .select("title company")
                    .lean()
                : Promise.resolve(null),
            ]);

            sse(controller, encoder, {
              type: "complete",
              result: toSafeGeneration(generation, {
                sourceResume: sourceResume
                  ? { id: sourceResume._id.toString(), fileName: sourceResume.fileName }
                  : null,
                jobDescription: jobDescription
                  ? {
                      id: jobDescription._id.toString(),
                      title: jobDescription.title ?? "",
                      company: jobDescription.company ?? "",
                    }
                  : null,
              }),
              editorHtml,
              task: currentTask,
            });
            break;
          }

          await sleep(POLL_INTERVAL_MS);
        }

        sse(controller, encoder, { type: "end" });
      } catch (error) {
        sse(controller, encoder, {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "The tailoring stream was interrupted.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
