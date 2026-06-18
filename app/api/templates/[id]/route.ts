import { NextResponse } from "next/server";
import { findDesignTemplate } from "@/lib/templates";

type TemplateRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, { params }: TemplateRouteProps) {
  try {
    const { id } = await params;
    const template = await findDesignTemplate(id);

    if (!template) {
      return NextResponse.json(
        { error: "Template not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Template detail error", error);

    return NextResponse.json(
      { error: "We couldn't load that template." },
      { status: 500 },
    );
  }
}
