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

type SignupTraceEntry = {
  step: string;
  status: "started" | "completed" | "failed";
  elapsedMs: number;
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

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}

function sanitizeErrorMessage(message: string) {
  let sanitized = message;
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    sanitized = sanitized.replaceAll(databaseUrl, "[DATABASE_URL redacted]");
  }

  return sanitized
    .replace(
      /((?:postgres(?:ql)?|redis(?:s)?):\/\/)[^@\s]+@/gi,
      "$1[credentials redacted]@",
    )
    .replace(/(password\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 1000);
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

  if (code === "ENOENT" && message.includes("query_compiler_bg.wasm")) {
    return {
      status: 503,
      body: {
        error:
          "Signup is unavailable because a required Prisma runtime asset is missing.",
        code: "prisma_runtime_asset_missing",
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

  if (code === "P2022" || code === "42703") {
    return {
      status: 503,
      body: {
        error:
          "Signup is unavailable because the database schema is out of date.",
        code: "database_schema_outdated",
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
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const trace: SignupTraceEntry[] = [];
  let currentStep = "request_received";

  const logStep = (
    step: string,
    status: SignupTraceEntry["status"],
  ) => {
    currentStep = step;
    const entry = { step, status, elapsedMs: Date.now() - startedAt };
    trace.push(entry);
    console.info("[signup:trace]", JSON.stringify({ requestId, ...entry }));
  };

  const runStep = async <T>(step: string, action: () => PromiseLike<T>) => {
    logStep(step, "started");
    try {
      const result = await action();
      logStep(step, "completed");
      return result;
    } catch (error) {
      logStep(step, "failed");
      throw error;
    }
  };

  logStep(currentStep, "started");

  try {
    const body = await runStep(
      "parse_request_body",
      () => request.json() as Promise<SignupRequestBody>,
    );

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const confirmPassword = body.confirmPassword;

    logStep("validate_input", "started");

    if (!email || !password || !confirmPassword) {
      logStep("validate_input", "failed");
      return NextResponse.json(
        {
          error: "Email, password, and confirmation are required.",
          code: "invalid_input",
          debug: { requestId, failedStep: currentStep, trace },
        },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      logStep("validate_input", "failed");
      return NextResponse.json(
        {
          error: "Password must be at least 8 characters long.",
          code: "password_too_short",
          debug: { requestId, failedStep: currentStep, trace },
        },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      logStep("validate_input", "failed");
      return NextResponse.json(
        {
          error: "Passwords do not match.",
          code: "passwords_do_not_match",
          debug: { requestId, failedStep: currentStep, trace },
        },
        { status: 400 },
      );
    }

    logStep("validate_input", "completed");

    await runStep("connect_database", connectToDatabase);

    const existingUser = await runStep("find_existing_user", () =>
      User.findOne({ email }).lean(),
    );

    if (existingUser) {
      logStep("check_existing_user", "failed");
      return NextResponse.json(
        {
          error: "An account with that email already exists.",
          code: "email_exists",
          debug: { requestId, failedStep: currentStep, trace },
        },
        { status: 409 },
      );
    }

    const passwordHash = await runStep("hash_password", () =>
      hash(password, 12),
    );

    const user = await runStep("create_user", () =>
      User.create({
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
      }),
    );

    const safeUser = await runStep("serialize_user", async () =>
      toSafeUser(user),
    );

    logStep("signup_complete", "completed");

    return NextResponse.json(
      {
        message: "Account created successfully.",
        user: safeUser,
        debug: { requestId, trace },
      },
      { status: 201 },
    );
  } catch (error) {
    const errorDetails = {
      name: getErrorName(error),
      code: getErrorCode(error) ?? null,
      message: sanitizeErrorMessage(getErrorMessage(error)),
    };

    console.error("[signup:error]", {
      requestId,
      failedStep: currentStep,
      error: errorDetails,
      stack: error instanceof Error ? error.stack : undefined,
      trace,
    });

    const response = getSignupErrorResponse(error);

    return NextResponse.json(
      {
        ...response.body,
        debug: {
          requestId,
          failedStep: currentStep,
          error: errorDetails,
          trace,
        },
      },
      { status: response.status },
    );
  }
}
