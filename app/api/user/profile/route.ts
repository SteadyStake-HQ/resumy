import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  DEFAULT_AI_PROVIDER,
  isAIProvider,
  normalizeAIProvider,
} from "@/lib/ai-provider";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { toSafeUser } from "@/lib/user";
import User from "@/models/User";

type UpdateProfileRequestBody = {
  nickname?: string;
  preferredAI?: string;
};

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as UpdateProfileRequestBody;

    const nickname = body.nickname?.trim() ?? "";
    const preferredAIRaw =
      typeof body.preferredAI === "string"
        ? body.preferredAI.trim().toLowerCase()
        : "";
    const preferredAI = normalizeAIProvider(preferredAIRaw || DEFAULT_AI_PROVIDER);

    if (nickname.length > 40) {
      return NextResponse.json(
        { error: "Nickname must be 40 characters or fewer." },
        { status: 400 },
      );
    }

    if (preferredAIRaw && !isAIProvider(preferredAIRaw)) {
      return NextResponse.json(
        { error: "Unsupported AI model preference." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const user = await User.findByIdAndUpdate(
      session.user.id,
      {
        $set: {
          nickname,
          "settings.preferredAI": preferredAI,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ user: toSafeUser(user) });
  } catch (error) {
    console.error("Profile update error", error);

    return NextResponse.json(
      { error: "Something went wrong while updating the profile." },
      { status: 500 },
    );
  }
}
