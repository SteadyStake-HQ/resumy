type ApiErrorPayload = {
  error?: string;
};

export const GEMINI_ROUTER_REFRESH_EVENT = "gemini-router:refresh";
export const HUGGINGFACE_ROUTER_REFRESH_EVENT =
  "huggingface-router:refresh";
export const RESUME_VAULT_REFRESH_EVENT = "resume-vault:refresh";

export type ResumeVaultRefreshDetail = {
  fileName?: string | null;
  resumeId: string;
  taskId?: string;
};

const RESPONSE_DETAILS_LIMIT = 1800;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string) {
  if (value.length <= RESPONSE_DETAILS_LIMIT) {
    return value;
  }

  return `${value.slice(0, RESPONSE_DETAILS_LIMIT - 1).trimEnd()}...`;
}

function extractHtmlSummary(html: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = normalizeWhitespace(titleMatch?.[1] ?? "");
  const text = normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );

  if (title && text && !text.startsWith(title)) {
    return clipText(`${title}. ${text}`);
  }

  return clipText(title || text);
}

export async function readApiResponse<T extends ApiErrorPayload>(
  response: Response,
  fallbackError: string,
) {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    const contentType = response.headers.get("content-type") ?? "";
    const looksLikeHtml =
      contentType.includes("text/html") || responseText.trimStart().startsWith("<");
    const details = looksLikeHtml
      ? extractHtmlSummary(responseText)
      : clipText(normalizeWhitespace(responseText));
    const statusSummary = response.status
      ? `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
      : "unexpected response";

    return {
      error: details
        ? `${fallbackError}\n\nResponse details (${statusSummary}):\n${details}`
        : `${fallbackError}\n\nResponse details: ${statusSummary}.`,
    } as T;
  }
}

export function notifyGeminiRouterRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(GEMINI_ROUTER_REFRESH_EVENT));
  window.dispatchEvent(new CustomEvent(HUGGINGFACE_ROUTER_REFRESH_EVENT));
}

export function notifyResumeVaultRefresh(detail: ResumeVaultRefreshDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ResumeVaultRefreshDetail>(RESUME_VAULT_REFRESH_EVENT, {
      detail,
    }),
  );
}
