import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { toSafeUser } from "@/lib/user";
import User from "@/models/User";

type UpgradeRequestBody = {
  reason?: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as UpgradeRequestBody;
    const reason = body.reason?.trim() ?? "";

    if (reason.length < 20) {
      return NextResponse.json(
        { error: "Please share a bit more context for the upgrade request." },
        { status: 400 },
      );
    }

    if (reason.length > 500) {
      return NextResponse.json(
        { error: "Upgrade reasons must be 500 characters or fewer." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const user = await User.findById(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.membership?.tier === "premium") {
      return NextResponse.json(
        { error: "Your account is already on the premium tier." },
        { status: 400 },
      );
    }

    user.membership = {
      ...user.membership,
      requestedTier: "premium",
      requestStatus: "pending",
      requestDate: new Date(),
      requestReason: reason,
    };

    await user.save();

    return NextResponse.json({ user: toSafeUser(user) });
  } catch (error) {
    console.error("Membership request error", error);

    return NextResponse.json(
      { error: "We couldn't submit your membership request." },
      { status: 500 },
    );
  }
}
