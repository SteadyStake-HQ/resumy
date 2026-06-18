import "server-only";

const HUGGINGFACE_BASE_URL = "https://router.huggingface.co/v1";
const HUGGINGFACE_CHAT_COMPLETIONS_URL = `${HUGGINGFACE_BASE_URL}/chat/completions`;
const HUGGINGFACE_MODEL =
  process.env.HUGGINGFACE_MODEL?.trim() ||
  "meta-llama/Llama-3.1-8B-Instruct:novita";
const NUMBERED_HUGGINGFACE_KEY_PATTERN = /^HF_TOKEN_(\d+)$/;
const HUGGINGFACE_REQUEST_TIMEOUT_MS = 120_000;

export type HuggingFaceGenerationOptions = {
  maxOutputTokens?: number;
  preferredRouterIndex?: number;
  temperature?: number;
};

export type HuggingFaceChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type HuggingFaceRouterInfo = {
  index: number;
  name: string;
  envName: string;
  isDefault: boolean;
  isSelected: boolean;
  model: string;
};

export type HuggingFaceRouterStatus =
  | "configured"
  | "available"
  | "invalid"
  | "limited"
  | "error";

export type HuggingFaceRouterHealth = HuggingFaceRouterInfo & {
  status: HuggingFaceRouterStatus;
  detail: string;
  checkedAt: string | null;
  quota: null;
};

type HuggingFaceRouterSecret = HuggingFaceRouterInfo & {
  apiKey: string;
};

export class HuggingFaceRouterRequestError extends Error {
  readonly routerIndex: number | null;
  readonly routerName: string | null;
  readonly routerStatus: Exclude<HuggingFaceRouterStatus, "configured" | "available">;
  readonly shouldRetry: boolean;
  readonly sourceError: unknown;

  constructor(input: {
    message: string;
    routerIndex?: number | null;
    routerName?: string | null;
    routerStatus: Exclude<HuggingFaceRouterStatus, "configured" | "available">;
    shouldRetry?: boolean;
    sourceError?: unknown;
  }) {
    super(input.message);
    this.name = "HuggingFaceRouterRequestError";
    this.routerIndex = input.routerIndex ?? null;
    this.routerName = input.routerName ?? null;
    this.routerStatus = input.routerStatus;
    this.shouldRetry = input.shouldRetry ?? false;
    this.sourceError = input.sourceError;
  }
}

function createRouterInfo(index: number, envName: string): HuggingFaceRouterInfo {
  return {
    index,
    name: `Router ${index}`,
    envName,
    isDefault: index === 1,
    isSelected: index === 1,
    model: HUGGINGFACE_MODEL,
  };
}

export function normalizeHuggingFaceRouterIndex(value: unknown) {
  const routerIndex =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  return Number.isInteger(routerIndex) && routerIndex > 0 ? routerIndex : 1;
}

function getConfiguredHuggingFaceRouters(): HuggingFaceRouterSecret[] {
  const numberedRouters = Object.entries(process.env)
    .map(([envName, value]) => {
      const match = envName.match(NUMBERED_HUGGINGFACE_KEY_PATTERN);
      const apiKey = value?.trim();

      if (!match || !apiKey) {
        return null;
      }

      return {
        ...createRouterInfo(Number.parseInt(match[1] as string, 10), envName),
        apiKey,
      };
    })
    .filter((router): router is HuggingFaceRouterSecret => Boolean(router))
    .sort((left, right) => left.index - right.index);

  if (numberedRouters.length) {
    return numberedRouters;
  }

  const legacyKey = process.env.HF_TOKEN?.trim();

  return legacyKey
    ? [{ ...createRouterInfo(1, "HF_TOKEN"), apiKey: legacyKey }]
    : [];
}

function withSelectedRouter<T extends HuggingFaceRouterInfo>(
  router: T,
  selectedRouterIndex = 1,
) {
  return {
    ...router,
    isSelected:
      router.index === normalizeHuggingFaceRouterIndex(selectedRouterIndex),
  };
}

function getOrderedHuggingFaceRouters(preferredRouterIndex?: number) {
  const routers = getConfiguredHuggingFaceRouters();

  if (preferredRouterIndex !== undefined) {
    const selectedRouterIndex = normalizeHuggingFaceRouterIndex(
      preferredRouterIndex,
    );
    const selectedRouter = routers.find(
      (router) => router.index === selectedRouterIndex,
    );

    return selectedRouter ? [selectedRouter] : [];
  }

  return routers;
}

function toHealth(
  router: HuggingFaceRouterInfo,
  status: HuggingFaceRouterStatus,
  detail: string,
  checkedAt: string | null = null,
): HuggingFaceRouterHealth {
  return {
    ...router,
    status,
    detail,
    checkedAt,
    quota: null,
  };
}

export function listHuggingFaceRouters(
  selectedRouterIndex = 1,
): HuggingFaceRouterHealth[] {
  const routers = getConfiguredHuggingFaceRouters();

  if (!routers.length) {
    return [
      toHealth(
        createRouterInfo(1, "HF_TOKEN_1"),
        "error",
        "No Hugging Face routers are configured. Add HF_TOKEN_1 first.",
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

export function hasHuggingFaceRouter(routerIndex: number) {
  return getConfiguredHuggingFaceRouters().some(
    (router) => router.index === normalizeHuggingFaceRouterIndex(routerIndex),
  );
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

function classifyHuggingFaceError(error: unknown): {
  status: Exclude<HuggingFaceRouterStatus, "configured" | "available">;
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
    normalizedMessage.includes("invalid token") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("forbidden")
  ) {
    return {
      status: "invalid",
      detail:
        "The Hugging Face token was rejected or does not have access to this model.",
      canTryNext: true,
      shouldRetrySameRouter: false,
    };
  }

  if (
    status === 429 ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("quota")
  ) {
    return {
      status: "limited",
      detail:
        "No remaining request capacity right now, or this router is rate-limited.",
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
      detail: "Hugging Face is temporarily unavailable for this router.",
      canTryNext: true,
      shouldRetrySameRouter: false,
    };
  }

  return {
    status: "error",
    detail: message || "Hugging Face request failed for this router.",
    canTryNext: false,
    shouldRetrySameRouter: false,
  };
}

async function postHuggingFaceChat(
  apiKey: string,
  messages: HuggingFaceChatMessage[],
  options: HuggingFaceGenerationOptions = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HUGGINGFACE_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(HUGGINGFACE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HUGGINGFACE_MODEL,
        messages,
        max_tokens: options.maxOutputTokens ?? 4096,
        temperature: options.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hugging Face request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
        message?: string;
        error?: string;
        reason?: string;
      }
    | null;

  if (!response.ok) {
    const errorDetail =
      payload?.message ||
      payload?.error ||
      payload?.reason ||
      `HTTP ${response.status}`;
    const error = new Error(`Hugging Face request failed: ${errorDetail}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  const responseText = payload?.choices?.[0]?.message?.content?.trim();

  if (!responseText) {
    throw new Error("Hugging Face did not return any text.");
  }

  return responseText;
}

export async function generateHuggingFaceTextWithFallback(
  messages: HuggingFaceChatMessage[],
  options: HuggingFaceGenerationOptions = {},
) {
  const routers = getOrderedHuggingFaceRouters(options.preferredRouterIndex);
  let lastError: unknown = null;

  if (!routers.length) {
    if (options.preferredRouterIndex !== undefined) {
      throw new HuggingFaceRouterRequestError({
        message: `Hugging Face Router ${normalizeHuggingFaceRouterIndex(options.preferredRouterIndex)} is not configured on the server.`,
        routerIndex: normalizeHuggingFaceRouterIndex(options.preferredRouterIndex),
        routerName: `Router ${normalizeHuggingFaceRouterIndex(options.preferredRouterIndex)}`,
        routerStatus: "error",
        shouldRetry: false,
      });
    }

    throw new Error("No Hugging Face routers configured. Add HF_TOKEN_1.");
  }

  for (const router of routers) {
    try {
      const text = await postHuggingFaceChat(router.apiKey, messages, options);
      return { text, router };
    } catch (error) {
      const classification = classifyHuggingFaceError(error);
      const wrappedError = new HuggingFaceRouterRequestError({
        message: `${router.name}: ${classification.detail}`,
        routerIndex: router.index,
        routerName: router.name,
        routerStatus: classification.status,
        shouldRetry: classification.shouldRetrySameRouter,
        sourceError: error,
      });
      lastError = wrappedError;

      console.warn(
        `Hugging Face ${router.name} failed with ${classification.status}: ${classification.detail}`,
      );

      if (!classification.canTryNext) {
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Hugging Face routers failed.");
}

export async function checkHuggingFaceRouter(
  routerIndex: number,
  selectedRouterIndex = 1,
) {
  const routers = getConfiguredHuggingFaceRouters();
  const router = routers.find((entry) => entry.index === routerIndex);
  const checkedAt = new Date().toISOString();

  if (!router) {
    return toHealth(
      withSelectedRouter(
        createRouterInfo(routerIndex, `HF_TOKEN_${routerIndex}`),
        selectedRouterIndex,
      ),
      "error",
      "This router is not configured on the server.",
      checkedAt,
    );
  }

  try {
    await postHuggingFaceChat(
      router.apiKey,
      [{ role: "user", content: "Reply with OK." }],
      { maxOutputTokens: 16, temperature: 0 },
    );

    return toHealth(
      withSelectedRouter(router, selectedRouterIndex),
      "available",
      "Ready.",
      checkedAt,
    );
  } catch (error) {
    const classification = classifyHuggingFaceError(error);
    return toHealth(
      withSelectedRouter(router, selectedRouterIndex),
      classification.status,
      classification.detail,
      checkedAt,
    );
  }
}

export async function checkAllHuggingFaceRouters(selectedRouterIndex = 1) {
  const routers = getConfiguredHuggingFaceRouters();

  if (!routers.length) {
    return listHuggingFaceRouters(selectedRouterIndex);
  }

  return Promise.all(
    routers.map((router) =>
      checkHuggingFaceRouter(router.index, selectedRouterIndex),
    ),
  );
}
