import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { readUploadedFileFromRequest } from "@/lib/file-upload";
import {
  extractDocumentTextFromFile,
  extractDocumentTitleFromFileName,
} from "@/lib/resume-processing";

const MAX_JOB_DESCRIPTION_FILE_SIZE = 8 * 1024 * 1024;

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const file = await readUploadedFileFromRequest(request, {
      maxFileSize: MAX_JOB_DESCRIPTION_FILE_SIZE,
      sizeError: "Job description files must be 8 MB or smaller.",
      missingFileError: "Please upload a TXT, PDF, or DOCX file.",
    });

    const content = await extractDocumentTextFromFile(file);

    if (content.length < 30) {
      return NextResponse.json(
        { error: "We couldn't extract enough text from that file." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      content,
      title: extractDocumentTitleFromFileName(file.name),
    });
  } catch (error) {
    console.error("Job description extract error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while extracting the job description.",
      },
      { status: 500 },
    );
  }
}
