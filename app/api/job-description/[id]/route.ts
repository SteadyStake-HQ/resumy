import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { toSafeJobDescription } from "@/lib/job-description";
import { connectToDatabase } from "@/lib/db";
import JobDescription from "@/models/JobDescription";

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
    return NextResponse.json(
      { error: "Invalid job description id." },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const jobDescription = await JobDescription.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!jobDescription) {
    return NextResponse.json(
      { error: "Job description not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    jobDescription: toSafeJobDescription(jobDescription),
  });
}
