import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { toSafeResume } from "@/lib/resume";
import Resume from "@/models/Resume";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid resume id." }, { status: 400 });
  }

  await connectToDatabase();

  const resume = await Resume.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  return NextResponse.json({ resume: toSafeResume(resume) });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid resume id." }, { status: 400 });
  }

  if (!Types.ObjectId.isValid(session.user.id)) {
    console.error(`[DELETE /api/resume/${id}] Invalid userId in session: "${session.user.id}"`);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectToDatabase();

  const resumeId = new Types.ObjectId(id);
  const userId = new Types.ObjectId(session.user.id);

  const deletedResume = await Resume.findOneAndDelete({
    _id: resumeId,
    userId,
  }).lean();

  if (!deletedResume) {
    // Log diagnostic info to help trace the root cause.
    const existsForOtherUser = await Resume.exists({ _id: resumeId });
    if (existsForOtherUser) {
      console.error(
        `[DELETE /api/resume/${id}] Resume exists but userId mismatch. Session userId: "${session.user.id}"`,
      );
    } else {
      console.warn(
        `[DELETE /api/resume/${id}] Resume not found in DB (may have already been deleted). Session userId: "${session.user.id}"`,
      );
    }
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
