import "server-only";

import {
  GoogleGenerativeAI,
  type ResponseSchema,
} from "@google/generative-ai";
import {
  type GeminiQuotaInfo,
  validateGeminiApiKey,
} from "@/lib/gemini-validator";

const GEMINI_MODEL = "gemini-2.5-flash";
const NUMBERED_GEMINI_KEY_PATTERN = /^GEMINI_API_KEY_(\d+)$/;

export type GeminiGenerationOptions = {
  maxOutputTokens?: number;
  preferredRouterIndex?: number;
  responseMimeType?: string;
  responseSchema?: ResponseSchema;
  temperature?: number;
};

export type GeminiRouterInfo = {
  index: number;
  name: string;
  envName: string;
  isDefault: boolean;
  isSelected: boolean;
  model: string;
};

export type GeminiRouterStatus =
  | "configured"
  | "available"
  | "invalid"
  | "limited"
  | "error";

export type GeminiRouterHealth = GeminiRouterInfo & {
  status: GeminiRouterStatus;
  detail: string;
  checkedAt: string | null;
  quota: GeminiQuotaInfo | null;
};

type GeminiRouterSecret = GeminiRouterInfo & {
  apiKey: string;
};

export class GeminiRouterRequestError extends Error {
  readonly routerIndex: number | null;
  readonly routerName: string | null;
  readonly routerStatus: Exclude<GeminiRouterStatus, "configured" | "available">;
  readonly shouldRetry: boolean;
  readonly sourceError: unknown;

  constructor(input: {
    message: string;
    routerIndex?: number | null;
    routerName?: string | null;
    routerStatus: Exclude<GeminiRouterStatus, "configured" | "available">;
    shouldRetry?: boolean;
    sourceError?: unknown;
  }) {
    super(input.message);
    this.name = "GeminiRouterRequestError";
    this.routerIndex = input.routerIndex ?? null;
    this.routerName = input.routerName ?? null;
    this.routerStatus = input.routerStatus;
    this.shouldRetry = input.shouldRetry ?? false;
    this.sourceError = input.sourceError;
  }
}

function createRouterInfo(index: number, envName: string): GeminiRouterInfo {
  return {
    index,
    name: `Router ${index}`,
    envName,
    isDefault: index === 1,
    isSelected: index === 1,
    model: GEMINI_MODEL,
  };
}

export function normalizeGeminiRouterIndex(value: unknown) {
  const routerIndex =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  return Number.isInteger(routerIndex) && routerIndex > 0 ? routerIndex : 1;
}

function getConfiguredGeminiRouters(): GeminiRouterSecret[] {
  const numberedRouters = Object.entries(process.env)
    .map(([envName, value]) => {
      const match = envName.match(NUMBERED_GEMINI_KEY_PATTERN);
      const apiKey = value?.trim();

      if (!match || !apiKey) {
        return null;
      }

      return {
        ...createRouterInfo(Number.parseInt(match[1] as string, 10), envName),
        apiKey,
      };
    })
    .filter((router): router is GeminiRouterSecret => Boolean(router))
    .sort((left, right) => left.index - right.index);

  if (numberedRouters.length) {
    return numberedRouters;
  }

  const legacyKey = process.env.GEMINI_API_KEY?.trim();

  return legacyKey
    ? [{ ...createRouterInfo(1, "GEMINI_API_KEY"), apiKey: legacyKey }]
    : [];
}

function withSelectedRouter<T extends GeminiRouterInfo>(
  router: T,
  selectedRouterIndex = 1,
) {
  return {
    ...router,
    isSelected: router.index === normalizeGeminiRouterIndex(selectedRouterIndex),
  };
}

function getOrderedGeminiRouters(preferredRouterIndex?: number) {
  const routers = getConfiguredGeminiRouters();

  if (preferredRouterIndex !== undefined) {
    const selectedRouterIndex = normalizeGeminiRouterIndex(preferredRouterIndex);
    const selectedRouter = routers.find(
      (router) => router.index === selectedRouterIndex,
    );

    return selectedRouter ? [selectedRouter] : [];
  }

  return routers;
}

function toHealth(
  router: GeminiRouterInfo,
  status: GeminiRouterStatus,
  detail: string,
  checkedAt: string | null = null,
  quota: GeminiQuotaInfo | null = null,
): GeminiRouterHealth {
  return {
    ...router,
    status,
    detail,
    checkedAt,
    quota,
  };
}

export function listGeminiRouters(selectedRouterIndex = 1): GeminiRouterHealth[] {
  const routers = getConfiguredGeminiRouters();

  if (!routers.length) {
    return [
      toHealth(
        createRouterInfo(1, "GEMINI_API_KEY_1"),
        "error",
        "No Gemini routers are configured. Add GEMINI_API_KEY_1 first.",
      ),
    ];
  }

  return routers.map((router) =>
    toHealth(
      withSelectedRouter(
        {
          index: router.index,
          name: router.name,
          envName: router.envName,
          isDefault: router.isDefault,
          isSelected: router.isSelected,
          model: router.model,
        },
        selectedRouterIndex,
      ),
      "configured",
      "Configured. Run a check to verify capacity.",
    ),
  );
}

export function hasGeminiRouter(routerIndex: number) {
  return getConfiguredGeminiRouters().some(
    (router) => router.index === normalizeGeminiRouterIndex(routerIndex),
  );
}

function createGeminiModel(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStatus(error: unknown) {
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const status =
    typeof record.status === "number"
      ? record.status
      : typeof record.statusCode === "number"
        ? record.statusCode
        : typeof record.response?.status === "number"
          ? record.response.status
          : null;

  return status;
}

function classifyGeminiError(error: unknown): {
  status: Exclude<GeminiRouterStatus, "configured" | "available">;
  detail: string;
  canTryNext: boolean;
  shouldRetrySameRouter: boolean;
} {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error);
  const normalizedMessage = message.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("unauthenticated") ||
    normalizedMessage.includes("permission_denied") ||
    normalizedMessage.includes("permission denied")
  ) {
    return {
      status: "invalid",
      detail: "The API key was rejected or does not have access to this model.",
      canTryNext: true,
      shouldRetrySameRouter: false,
    };
  }

  if (
    status === 429 ||
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("resource_exhausted") ||
    normalizedMessage.includes("too many requests")
  ) {
    return {
      status: "limited",
      detail: "No remaining request capacity right now, or this router is rate-limited.",
      canTryNext: true,
      shouldRetrySameRouter: false,
    };
  }

  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    normalizedMessage.includes("unavailable") ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("network")
  ) {
    return {
      status: "error",
      detail: "Gemini is temporarily unavailable for this router.",
      canTryNext: true,
      shouldRetrySameRouter: false,
    };
  }

  return {
    status: "error",
    detail: message || "Gemini request failed for this router.",
    canTryNext: false,
    shouldRetrySameRouter: false,
  };
}

export function shouldRetryGeminiRequest(error: unknown) {
  return !(
    error instanceof GeminiRouterRequestError && !error.shouldRetry
  );
}

export async function generateGeminiTextWithFallback(
  prompt: string,
  options: GeminiGenerationOptions = {},
) {
  const routers = getOrderedGeminiRouters(options.preferredRouterIndex);
  let lastError: unknown = null;

  if (!routers.length) {
    if (options.preferredRouterIndex !== undefined) {
      throw new GeminiRouterRequestError({
        message: `Gemini Router ${normalizeGeminiRouterIndex(options.preferredRouterIndex)} is not configured on the server.`,
        routerIndex: normalizeGeminiRouterIndex(options.preferredRouterIndex),
        routerName: `Router ${normalizeGeminiRouterIndex(options.preferredRouterIndex)}`,
        routerStatus: "error",
        shouldRetry: false,
      });
    }

    throw new Error("No Gemini routers configured. Add GEMINI_API_KEY_1.");
  }

  for (const router of routers) {
    try {
      const model = createGeminiModel(router.apiKey);
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxOutputTokens ?? 4096,
          responseMimeType: options.responseMimeType,
          responseSchema: options.responseSchema,
        },
      });

      return {
        text: result.response.text(),
        router,
      };
    } catch (error) {
      const classification = classifyGeminiError(error);
      const wrappedError = new GeminiRouterRequestError({
        message: `${router.name}: ${classification.detail}`,
        routerIndex: router.index,
        routerName: router.name,
        routerStatus: classification.status,
        shouldRetry: classification.shouldRetrySameRouter,
        sourceError: error,
      });
      lastError = wrappedError;

      console.warn(
        `Gemini ${router.name} failed with ${classification.status}: ${classification.detail}`,
      );

      if (!classification.canTryNext) {
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini routers failed.");
}

export async function checkGeminiRouter(
  routerIndex: number,
  selectedRouterIndex = 1,
) {
  const routers = getConfiguredGeminiRouters();
  const router = routers.find((entry) => entry.index === routerIndex);
  const checkedAt = new Date().toISOString();

  if (!router) {
    return toHealth(
      withSelectedRouter(
        createRouterInfo(routerIndex, `GEMINI_API_KEY_${routerIndex}`),
        selectedRouterIndex,
      ),
      "error",
      "This router is not configured on the server.",
      checkedAt,
    );
  }

  const result = await validateGeminiApiKey(router.apiKey);

  if (result.status === "valid") {
    return toHealth(
      withSelectedRouter(router, selectedRouterIndex),
      "available",
      result.quota.remainingRequests || result.quota.remainingTokens
        ? "Ready. Quota headers received."
        : "Ready. Google did not return quota headers.",
      result.checkedAt,
      result.quota,
    );
  }

  return toHealth(
    withSelectedRouter(router, selectedRouterIndex),
    result.status === "invalid"
      ? "invalid"
      : result.status === "limited"
        ? "limited"
        : "error",
    result.message,
    result.checkedAt ?? checkedAt,
    result.quota,
  );
}

export async function checkAllGeminiRouters(selectedRouterIndex = 1) {
  const routers = getConfiguredGeminiRouters();

  if (!routers.length) {
    return listGeminiRouters(selectedRouterIndex);
  }

  return Promise.all(
    routers.map((router) =>
      checkGeminiRouter(router.index, selectedRouterIndex),
    ),
  );
}
