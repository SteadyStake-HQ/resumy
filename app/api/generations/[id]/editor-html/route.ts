import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { buildEditorHtmlFromResume } from "@/lib/editor-document";
import { connectToDatabase } from "@/lib/db";
import Generation from "@/models/Generation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  if (!id || !Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid generation id." }, { status: 400 });
  }

  await connectToDatabase();

  const generation = await Generation.findOne({
    _id: id,
    userId: session.user.id,
  })
    .select("editorHtml editorTemplateId tailoredData")
    .lean();

  if (!generation) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  const hasBaseEditorHtml =
    Boolean(generation.editorHtml) &&
    (!generation.editorTemplateId || generation.editorTemplateId === "base");

  // Legacy template HTML is replaced by the standard editable document.
  const html =
    (hasBaseEditorHtml ? generation.editorHtml : null) ||
    (await buildEditorHtmlFromResume(generation.tailoredData));

  return NextResponse.json({ html });
}
