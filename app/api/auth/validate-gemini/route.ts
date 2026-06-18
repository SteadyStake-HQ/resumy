import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import { validateGeminiApiKey } from "@/lib/gemini-validator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    apiKey?: unknown;
  } | null;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey : "";
  const result = await validateGeminiApiKey(apiKey);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
