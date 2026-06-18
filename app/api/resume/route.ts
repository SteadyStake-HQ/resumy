import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { toSafeResume } from "@/lib/resume";
import Resume from "@/models/Resume";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectToDatabase();

  const resumes = await Resume.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    resumes: resumes.map((resume) => toSafeResume(resume)),
  });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectToDatabase();

  const result = await Resume.deleteMany({ userId: session.user.id });

  return NextResponse.json({
    success: true,
    deletedCount: result.deletedCount ?? 0,
  });
}
