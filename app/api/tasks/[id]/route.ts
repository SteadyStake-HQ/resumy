import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  cancelBackgroundTaskForUser,
  deleteBackgroundTaskForUser,
  getBackgroundTaskForUser,
} from "@/lib/background-task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const task = await getBackgroundTaskForUser(id, session.user.id);

  if (!task) {
    return noStoreJson({ error: "Task not found." }, { status: 404 });
  }

  return noStoreJson({ task });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await deleteBackgroundTaskForUser(id, session.user.id);

  if (!result.ok) {
    return noStoreJson({ error: result.error }, { status: 400 });
  }

  return noStoreJson({ success: true });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action !== "cancel") {
    return noStoreJson({ error: "Unsupported action." }, { status: 400 });
  }

  const result = await cancelBackgroundTaskForUser(id, session.user.id);

  if (!result.ok) {
    return noStoreJson({ error: result.error }, { status: 400 });
  }

  return noStoreJson({ task: result.task });
}
