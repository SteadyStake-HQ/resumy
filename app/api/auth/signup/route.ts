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

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
}

function getSignupErrorResponse(error: unknown) {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);

  if (message.includes("DATABASE_URL")) {
    return {
      status: 503,
      body: {
        error:
          "Signup is unavailable because the database URL is not configured.",
        code: "database_url_missing",
      },
    };
  }

  if (code === "P2021" || code === "42P01") {
    return {
      status: 503,
      body: {
        error:
          "Signup is unavailable because the database schema has not been applied.",
        code: "database_schema_missing",
      },
    };
  }

  if (code === "P2002" || code === "23505") {
    return {
      status: 409,
      body: {
        error: "An account with that email already exists.",
        code: "email_exists",
      },
    };
  }

  if (
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|Can't reach database|connection/i.test(
      message,
    )
  ) {
    return {
      status: 503,
      body: {
        error:
          "Signup is unavailable because the app cannot connect to the database.",
        code: "database_unreachable",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Something went wrong while creating the account.",
      code: "signup_failed",
    },
  };
}

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
    const response = getSignupErrorResponse(error);

    return NextResponse.json(response.body, { status: response.status });
  }
}
