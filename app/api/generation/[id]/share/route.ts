import { randomBytes } from "crypto";
import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hasPremiumAccess } from "@/lib/membership";
import { connectToDatabase } from "@/lib/db";
import { buildPublicResumeUrl } from "@/lib/public-url";
import Generation from "@/models/Generation";
import User from "@/models/User";

type ShareRequestBody = {
  enabled?: boolean;
};

async function createUniquePublicId() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomBytes(9).toString("base64url");
    const existingGeneration = await Generation.findOne({
      publicId: candidate,
    }).lean();

    if (!existingGeneration) {
      return candidate;
    }
  }

  throw new Error("Failed to create a unique share id.");
}

type ShareRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  { params }: ShareRouteProps,
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid generation id." }, { status: 400 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ShareRequestBody;

    await connectToDatabase();

    const [user, generation] = await Promise.all([
      User.findById(session.user.id).lean(),
      Generation.findOne({
        _id: id,
        userId: session.user.id,
      }),
    ]);

    if (!user || !hasPremiumAccess(user.membership?.tier)) {
      return NextResponse.json(
        { error: "Premium membership is required to share public links." },
        { status: 403 },
      );
    }

    if (!generation) {
      return NextResponse.json(
        { error: "Generation not found." },
        { status: 404 },
      );
    }

    if (body.enabled === false) {
      generation.publicId = null;
      await generation.save();

      return NextResponse.json({ publicId: null, publicUrl: null });
    }

    if (!generation.publicId) {
      generation.publicId = await createUniquePublicId();
      await generation.save();
    }

    return NextResponse.json({
      publicId: generation.publicId,
      publicUrl: buildPublicResumeUrl(generation.publicId, request),
    });
  } catch (error) {
    console.error("Public share error", error);

    return NextResponse.json(
      { error: "We couldn't update the public share link." },
      { status: 500 },
    );
  }
}
