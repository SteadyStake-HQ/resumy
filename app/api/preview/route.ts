import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { renderResumeHtml } from "@/lib/renderer";
import Generation from "@/models/Generation";

function parseCustomization(searchValue: string | null) {
  if (!searchValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(searchValue) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new NextResponse("Unauthorized.", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const generationId = searchParams.get("generationId");
  const templateId = searchParams.get("templateId");

  if (!generationId || !/^[0-9a-fA-F]{24}$/.test(generationId) || !templateId) {
    return new NextResponse("Missing preview parameters.", { status: 400 });
  }

  try {
    await connectToDatabase();

    const generation = await Generation.findOne({
      _id: generationId,
      userId: session.user.id,
    }).lean();

    if (!generation) {
      return new NextResponse("Generation not found.", { status: 404 });
    }

    const html = await renderResumeHtml(
      generation.tailoredData,
      templateId,
      parseCustomization(searchParams.get("customization")),
    );

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Preview render error", error);

    return new NextResponse("We couldn't render the preview.", { status: 500 });
  }
}
