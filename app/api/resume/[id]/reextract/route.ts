import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { queueResumeReextractTaskForUser } from "@/lib/background-task-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await queueResumeReextractTaskForUser(id, session.user.id);

  if (!result.ok || !result.task) {
    return NextResponse.json(
      { error: result.error ?? "Could not queue resume re-extraction." },
      { status: 400 },
    );
  }

  return NextResponse.json({ task: result.task }, { status: 202 });
}

