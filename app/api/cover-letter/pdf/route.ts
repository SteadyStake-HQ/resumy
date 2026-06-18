import { promises as fs } from "fs";
import path from "path";
import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hasPremiumAccess } from "@/lib/membership";
import { connectToDatabase } from "@/lib/db";
import { generateCoverLetterPDF } from "@/lib/renderer";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import User from "@/models/User";

type CoverLetterPdfRequestBody = {
  generationId?: string;
  coverLetter?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CoverLetterPdfRequestBody;
    const generationId = body.generationId?.trim() ?? "";
    const coverLetter = body.coverLetter?.trim() ?? "";

    if (!Types.ObjectId.isValid(generationId) || !coverLetter) {
      return NextResponse.json(
        { error: "A generation and cover letter are required." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const [user, generation] = await Promise.all([
      User.findById(session.user.id).lean(),
      Generation.findOne({
        _id: generationId,
        userId: session.user.id,
      }).lean(),
    ]);

    if (!user || !hasPremiumAccess(user.membership?.tier)) {
      return NextResponse.json(
        { error: "Premium membership is required for cover letters." },
        { status: 403 },
      );
    }

    if (!generation) {
      return NextResponse.json(
        { error: "Generation not found." },
        { status: 404 },
      );
    }

    const jobDescription = generation.jobDescriptionId
      ? await JobDescription.findById(generation.jobDescriptionId)
          .select("title company")
          .lean()
      : null;
    const pdfBuffer = await generateCoverLetterPDF(
      coverLetter,
      generation.tailoredData,
      {
        jobTitle: jobDescription?.title ?? null,
        company: jobDescription?.company ?? null,
      },
    );

    const outputDirectory = path.join(
      process.cwd(),
      "public",
      "generated",
      session.user.id,
    );
    const fileName = `${generation._id.toString()}-${slugify(
      jobDescription?.title || "cover-letter",
    )}-${Date.now()}.pdf`;

    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(path.join(outputDirectory, fileName), pdfBuffer);

    return NextResponse.json({
      pdfUrl: `/generated/${session.user.id}/${fileName}`,
    });
  } catch (error) {
    console.error("Cover letter PDF error", error);

    return NextResponse.json(
      { error: "We couldn't generate the cover letter PDF." },
      { status: 500 },
    );
  }
}
