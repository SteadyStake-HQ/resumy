import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import { getPremiumExpiryDate } from "@/lib/membership";
import { connectToDatabase } from "@/lib/db";
import { toSafeUser } from "@/lib/user";
import type { MembershipDetails, MembershipRequestStatus } from "@/models/User";
import User from "@/models/User";

type HandleMembershipRequestBody = {
  userId?: string;
  action?: "approve" | "reject";
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as HandleMembershipRequestBody;
    const userId = body.userId?.trim() ?? "";
    const action = body.action;

    if (!Types.ObjectId.isValid(userId)) {
      return NextResponse.json(
        { error: "Please choose a valid user." },
        { status: 400 },
      );
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "Please choose approve or reject." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const user = await User.findById(userId);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const requestStatus: MembershipRequestStatus =
      action === "approve" ? "approved" : "rejected";

    const baseMembership: MembershipDetails = {
      ...user.membership,
      requestedTier: "premium" as const,
      requestStatus,
      requestDate: user.membership?.requestDate ?? new Date(),
    };

    user.membership =
      action === "approve"
        ? {
            ...baseMembership,
            tier: "premium",
            status: "active",
            startedAt: new Date(),
            expiresAt: getPremiumExpiryDate(),
          }
        : {
            ...baseMembership,
            tier: "free",
            status: "active",
            expiresAt: null,
          };

    await user.save();

    return NextResponse.json({ user: toSafeUser(user) });
  } catch (error) {
    console.error("Membership approval error", error);

    return NextResponse.json(
      { error: "We couldn't update that membership request." },
      { status: 500 },
    );
  }
}
