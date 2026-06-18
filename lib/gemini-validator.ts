import "server-only";

const GEMINI_VALIDATION_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 10000;

export type GeminiQuotaInfo = {
  remainingRequests: string | null;
  remainingTokens: string | null;
  limitRequests: string | null;
  limitTokens: string | null;
  remainingDailyRequests: string | null;
  limitDailyRequests: string | null;
  reset: string | null;
  resetAt: string | null;
};

export type GeminiValidationStatus =
  | "valid"
  | "invalid"
  | "limited"
  | "error";

export type GeminiValidationResult = {
  ok: boolean;
  status: GeminiValidationStatus;
  statusCode: number | null;
  message: string;
  quota: GeminiQuotaInfo;
  checkedAt: string;
};

function getDefaultGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY_1?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    ""
  );
}

function createEmptyQuota(): GeminiQuotaInfo {
  return {
    remainingRequests: null,
    remainingTokens: null,
    limitRequests: null,
    limitTokens: null,
    remainingDailyRequests: null,
    limitDailyRequests: null,
    reset: null,
    resetAt: null,
  };
}

function readHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  return value?.trim() ? value.trim() : null;
}

function parseResetHeader(value: string | null) {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    if (numericValue > 1_000_000_000_000) {
      return new Date(numericValue).toISOString();
    }

    if (numericValue > 1_000_000_000) {
      return new Date(numericValue * 1000).toISOString();
    }

    if (numericValue >= 0) {
      return new Date(Date.now() + numericValue * 1000).toISOString();
    }
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function readQuota(headers: Headers): GeminiQuotaInfo {
  const reset = readHeader(headers, "x-ratelimit-reset");

  return {
    remainingRequests: readHeader(headers, "x-ratelimit-remaining-requests"),
    remainingTokens: readHeader(headers, "x-ratelimit-remaining-tokens"),
    limitRequests: readHeader(headers, "x-ratelimit-limit-requests"),
    limitTokens: readHeader(headers, "x-ratelimit-limit-tokens"),
    remainingDailyRequests:
      readHeader(headers, "x-ratelimit-remaining-requests-day") ??
      readHeader(headers, "x-ratelimit-remaining-daily-requests"),
    limitDailyRequests:
      readHeader(headers, "x-ratelimit-limit-requests-day") ??
      readHeader(headers, "x-ratelimit-limit-daily-requests"),
    reset,
    resetAt: parseResetHeader(reset),
  };
}

function parseQuotaNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const parsedValue = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function isQuotaExhausted(quota: GeminiQuotaInfo) {
  const quotaPairs = [
    [quota.remainingRequests, quota.limitRequests],
    [quota.remainingTokens, quota.limitTokens],
    [quota.remainingDailyRequests, quota.limitDailyRequests],
  ];

  return quotaPairs.some(([remainingValue, limitValue]) => {
    const remaining = parseQuotaNumber(remainingValue);
    const limit = parseQuotaNumber(limitValue);

    return remaining !== null && limit !== null && limit > 0 && remaining <= 0;
  });
}

function buildValidationUrl(apiKey: string) {
  const url = new URL(GEMINI_VALIDATION_ENDPOINT);
  url.searchParams.set("key", apiKey);
  return url;
}

export async function validateGeminiApiKey(
  apiKey?: string,
): Promise<GeminiValidationResult> {
  const keyToValidate = apiKey?.trim() || getDefaultGeminiApiKey();
  const checkedAt = new Date().toISOString();

  if (!keyToValidate) {
    return {
      ok: false,
      status: "error",
      statusCode: null,
      message: "No Gemini API key was provided.",
      quota: createEmptyQuota(),
      checkedAt,
    } satisfies GeminiValidationResult;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(buildValidationUrl(keyToValidate), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const quota = readQuota(response.headers);

    if (response.status === 200) {
      if (isQuotaExhausted(quota)) {
        return {
          ok: false,
          status: "limited",
          statusCode: response.status,
          message: "Gemini quota is exhausted or rate-limited right now.",
          quota,
          checkedAt,
        } satisfies GeminiValidationResult;
      }

      return {
        ok: true,
        status: "valid",
        statusCode: response.status,
        message: "Gemini API key is valid.",
        quota,
        checkedAt,
      } satisfies GeminiValidationResult;
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: "invalid",
        statusCode: response.status,
        message: "Invalid API Key.",
        quota,
        checkedAt,
      } satisfies GeminiValidationResult;
    }

    if (response.status === 429) {
      return {
        ok: false,
        status: "limited",
        statusCode: response.status,
        message: "Gemini quota is exhausted or rate-limited right now.",
        quota,
        checkedAt,
      } satisfies GeminiValidationResult;
    }

    return {
      ok: false,
      status: "error",
      statusCode: response.status,
      message: `Gemini validation failed with status ${response.status}.`,
      quota,
      checkedAt,
    } satisfies GeminiValidationResult;
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Gemini validation timed out."
        : error instanceof Error
          ? error.message
          : "Gemini validation failed.";

    return {
      ok: false,
      status: "error",
      statusCode: null,
      message,
      quota: createEmptyQuota(),
      checkedAt,
    } satisfies GeminiValidationResult;
  } finally {
    clearTimeout(timeout);
  }
}
