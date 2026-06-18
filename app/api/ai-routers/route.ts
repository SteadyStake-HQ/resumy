import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  checkAllGeminiRouters,
  checkGeminiRouter,
  hasGeminiRouter,
  listGeminiRouters,
  normalizeGeminiRouterIndex,
} from "@/lib/gemini-router";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export const runtime = "nodejs";

async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  return { session };
}

async function getSelectedRouterIndex(userId: string) {
  await connectToDatabase();

  const user = await User.findById(userId).select("settings").lean();

  return normalizeGeminiRouterIndex(user?.settings?.preferredGeminiRouterIndex);
}

export async function GET(request: Request) {
  const auth = await requireSession();

  if ("error" in auth) {
    return auth.error;
  }

  const selectedRouterIndex = await getSelectedRouterIndex(auth.session.user.id);
  const shouldCheck = new URL(request.url).searchParams.get("check") !== "0";
  const routers = shouldCheck
    ? await checkAllGeminiRouters(selectedRouterIndex)
    : listGeminiRouters(selectedRouterIndex);

  return NextResponse.json({ routers, selectedRouterIndex });
}

export async function POST(request: Request) {
  const auth = await requireSession();

  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as {
    routerIndex?: unknown;
    action?: unknown;
  } | null;
  const routerIndex =
    typeof body?.routerIndex === "number"
      ? body.routerIndex
      : Number.parseInt(String(body?.routerIndex ?? ""), 10);
  const action = typeof body?.action === "string" ? body.action : "check";

  if (!Number.isInteger(routerIndex) || routerIndex < 1) {
    return NextResponse.json(
      { error: "Please choose a valid router." },
      { status: 400 },
    );
  }

  const selectedRouterIndex = await getSelectedRouterIndex(auth.session.user.id);

  if (action === "select") {
    if (!hasGeminiRouter(routerIndex)) {
      return NextResponse.json(
        { error: "That router is not configured on the server." },
        { status: 400 },
      );
    }

    await User.findByIdAndUpdate(
      auth.session.user.id,
      {
        $set: {
          "settings.preferredGeminiRouterIndex": routerIndex,
        },
      },
      { runValidators: true },
    );

    const routers = await checkAllGeminiRouters(routerIndex);

    return NextResponse.json({
      routers,
      selectedRouterIndex: routerIndex,
    });
  }

  const router = await checkGeminiRouter(routerIndex, selectedRouterIndex);

  return NextResponse.json({ router, selectedRouterIndex });
}
