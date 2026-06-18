import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await connectToDatabase();

  const users = await User.find({ "membership.requestStatus": "pending" })
    .sort({ "membership.requestDate": 1, createdAt: 1 })
    .select("email nickname membership")
    .lean();

  return NextResponse.json({
    requests: users.map((user) => ({
      id: user._id.toString(),
      email: user.email,
      nickname: user.nickname ?? "",
      requestDate: user.membership?.requestDate
        ? new Date(user.membership.requestDate).toISOString()
        : null,
      requestedTier: user.membership?.requestedTier ?? "premium",
      requestReason: user.membership?.requestReason ?? "",
    })),
  });
}
