import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { toSafeUser } from "@/lib/user";
import User from "@/models/User";

type SignupRequestBody = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignupRequestBody;

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const confirmPassword = body.confirmPassword;

    if (!email || !password || !confirmPassword) {
      return NextResponse.json(
        { error: "Email, password, and confirmation are required." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const existingUser = await User.findOne({ email }).lean();

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await hash(password, 12);

    const user = await User.create({
      email,
      passwordHash,
      nickname: "",
      country: "",
      membership: {
        tier: "free",
        status: "active",
        startedAt: new Date(),
        expiresAt: null,
      },
    });

    return NextResponse.json(
      {
        message: "Account created successfully.",
        user: toSafeUser(user),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Signup error", error);

    return NextResponse.json(
      { error: "Something went wrong while creating the account." },
      { status: 500 },
    );
  }
}
