import { NextResponse } from "next/server";
import { listActiveDesignTemplates } from "@/lib/templates";

export async function GET() {
  try {
    const templates = await listActiveDesignTemplates();

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Template list error", error);

    return NextResponse.json(
      { error: "We couldn't load the design templates." },
      { status: 500 },
    );
  }
}
