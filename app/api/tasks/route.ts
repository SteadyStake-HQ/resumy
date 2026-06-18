import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  cancelActiveBackgroundTasksForUser,
  clearDismissibleBackgroundTasksForUser,
  listBackgroundTasksForUser,
} from "@/lib/background-task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const tasks = await listBackgroundTasksForUser(session.user.id);

    return noStoreJson({ tasks });
  } catch (error) {
    console.error("Task history load failed.", error);
    return noStoreJson(
      { error: "Task history could not be loaded." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await clearDismissibleBackgroundTasksForUser(session.user.id);

  return noStoreJson(result);
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: string }
    | null;

  if (body?.action !== "cancel_active") {
    return noStoreJson({ error: "Unsupported queue action." }, { status: 400 });
  }

  const result = await cancelActiveBackgroundTasksForUser(session.user.id);

  return noStoreJson(result);
}
