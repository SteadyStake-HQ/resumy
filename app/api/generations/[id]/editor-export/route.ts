import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  buildEditorHtmlFromResume,
  generateEditorDocx,
  generateEditorPdf,
  generateRawHtmlPdf,
} from "@/lib/editor-document";
import { connectToDatabase } from "@/lib/db";
import { normalizeResumeDocumentStyle } from "@/lib/resume-document-style";
import Generation from "@/models/Generation";

export const runtime = "nodejs";
export const maxDuration = 300;

type EditorExportBody = {
  format?: string;
  html?: string;
  editorHtml?: string;
  documentStyle?: unknown;
  /** When true, `html` is a complete <!doctype html> document — skip the
   *  wrapEditorHtmlDocument wrapper and pass it straight to Puppeteer. */
  rawHtmlDocument?: boolean;
};

/**
 * Builds a clean "Firstname_Lastname" download stem from the candidate's name,
 * e.g. "Jane A. Doe" → "Jane_Doe". Falls back to "Resume" when no usable name
 * is present so the download always has a sensible file name.
 */
function buildResumeDownloadStem(fullName: string | undefined | null) {
  const parts = (fullName ?? "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (!parts.length) {
    return "Resume";
  }

  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const stem = [first, last]
    .filter(Boolean)
    .join("_")
    .replace(/[^A-Za-z0-9_'-]/g, "");

  return stem || "Resume";
}

export async function POST(
  request: Request,
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

  const body = (await request.json().catch(() => null)) as EditorExportBody | null;
  const format = body?.format === "docx" ? "docx" : body?.format === "pdf" ? "pdf" : "";
  const rawHtmlDocument = body?.rawHtmlDocument === true;

  if (!format) {
    return NextResponse.json(
      { error: "Please choose PDF or DOCX export." },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const generation = await Generation.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!generation) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  const submittedHtml =
    typeof body?.html === "string" && body.html.trim() ? body.html : null;
  const savedEditorHtml =
    rawHtmlDocument && typeof body?.editorHtml === "string" && body.editorHtml.trim()
      ? body.editorHtml
      : submittedHtml ??
        generation.editorHtml ??
        (await buildEditorHtmlFromResume(generation.tailoredData));
  const renderHtml = submittedHtml ?? savedEditorHtml;
  const documentStyle = normalizeResumeDocumentStyle(body?.documentStyle);

  let outputBuffer: Uint8Array;
  try {
    if (format === "pdf") {
      outputBuffer =
        rawHtmlDocument && submittedHtml
          ? await generateRawHtmlPdf(submittedHtml)
          : await generateEditorPdf(renderHtml, documentStyle);
    } else {
      outputBuffer = await generateEditorDocx(renderHtml, documentStyle);
    }
  } catch (error) {
    console.error("Editor export rendering error", error);
    return NextResponse.json(
      {
        error:
          format === "pdf"
            ? "High-fidelity PDF export could not start because Chromium is unavailable on this machine."
            : "DOCX export could not render this edited resume.",
      },
      { status: 500 },
    );
  }

  const outputFileName = `${buildResumeDownloadStem(
    generation.tailoredData?.personalInfo?.name,
  )}.${format}`;

  await Generation.findByIdAndUpdate(
    generation._id,
    {
      editorHtml: savedEditorHtml,
      editorDocumentStyle: documentStyle,
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  ).lean();

  const responseBody = Uint8Array.from(outputBuffer).buffer;
  return new NextResponse(responseBody, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${outputFileName}"`,
      "Content-Length": String(outputBuffer.byteLength),
      "Content-Type":
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  });
}
