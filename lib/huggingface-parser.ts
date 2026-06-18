import "server-only";

import { jsonrepair } from "jsonrepair";

import {
  generateHuggingFaceTextWithFallback,
  type HuggingFaceChatMessage,
} from "@/lib/huggingface-router";
import { buildResumeAnalysisPrompt } from "@/lib/prompts/resume-analysis";
import {
  HF_RESUME_PARSING_SYSTEM_MESSAGE,
  buildHuggingFaceParsingUserMessage,
} from "@/lib/prompts/resume-parsing-hf";
import {
  createEmptyResumeExtractionMeta,
  normalizeAnalysisReport,
  normalizeParsedResumeData,
  normalizeResumeExtractionMeta,
  type ParsedResumeData,
  type ResumeAnalysisReport,
  type ResumeExtractionMeta,
  type ResumeSectionExtractionMeta,
  type ResumeSectionKey,
} from "@/lib/resume";
import {
  analyzeResumeFallback,
  auditResumeExtraction,
  extractResumeStructureContext,
  type ResumeExtractionAudit,
} from "@/lib/resume-processing";

/**
 * Deterministic HuggingFace resume pipeline.
 *
 * Design goals:
 *   1. Same input → same output. No stochastic variance.
 *   2. Single AI call per task (not 5 × sections). Fewer calls → fewer variance sources.
 *   3. Explicit failures — when AI fails, fall back to local deterministically and log it.
 *   4. No regex-rescue of malformed output, no "suspicious score" hybrids.
 *
 * Non-determinism sources removed vs the previous sequential pipeline:
 *   - temperature: 0.2 → 0
 *   - router fallback chain → pinned router (explicit preferred index or Router 1)
 *   - 5 sequential AI calls → 1 single-shot call
 *   - multi-stage JSON rescue (4 layers of regex) → strict parse + jsonrepair + 1 corrective retry
 *   - loose-text analysis fallback → deterministic local fallback
 *   - "mergeSectionValue" silent local reversion → explicit AI / fallback choice
 *   - parsedSoFar context leakage across sections → not applicable (single call)
 */

// ---- Tokenization & context fitting ---------------------------------------

// Conservative estimate for Llama-3.x tokenizer on English text.
// Real average is ~3.2-4.0 chars/token, but dense technical resumes can dip
// below 3.0. Using 2.5 guarantees we never under-budget the prompt.
const CHARS_PER_TOKEN = 2.5;
const CONTEXT_WINDOW_TOKENS = 16384;
const CONTEXT_BUFFER_TOKENS = 512;
const PARSE_MAX_OUTPUT_TOKENS = 4096;
const ANALYSIS_MAX_OUTPUT_TOKENS = 2048;
const MIN_OUTPUT_TOKENS = 1024;

// Hard maximum to keep a long resume from crowding the output budget.
// Matches the existing clipResumePromptText ceiling.
const MAX_USER_MESSAGE_CHARS = 28000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function clipToChars(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

/**
 * Fits system + user messages into the context window.
 * Strategy: pre-clip the user content to MAX_USER_MESSAGE_CHARS, then if
 * system+user+output still overflows the window, clip the user content further.
 * Never panic-clips to 300 chars — if the math collapses we simply accept a
 * smaller completion budget (the caller will either succeed with a short resume
 * or fail with a clear error).
 */
function fitMessages(
  systemMessage: string,
  userContent: string,
  requestedOutputTokens: number,
): { messages: HuggingFaceChatMessage[]; maxOutputTokens: number } {
  const cappedUserContent = clipToChars(
    userContent.trim(),
    MAX_USER_MESSAGE_CHARS,
  );
  const systemTokens = estimateTokens(systemMessage);
  const cappedRequest = Math.min(
    Math.max(MIN_OUTPUT_TOKENS, requestedOutputTokens),
    CONTEXT_WINDOW_TOKENS - CONTEXT_BUFFER_TOKENS - systemTokens - 1,
  );

  const userTokenBudget =
    CONTEXT_WINDOW_TOKENS -
    systemTokens -
    cappedRequest -
    CONTEXT_BUFFER_TOKENS;
  const userCharBudget = Math.max(
    0,
    Math.floor(userTokenBudget * CHARS_PER_TOKEN),
  );

  const clippedUser = clipToChars(cappedUserContent, userCharBudget);
  const userTokens = estimateTokens(clippedUser);

  const actualCompletion = Math.max(
    MIN_OUTPUT_TOKENS,
    Math.min(
      requestedOutputTokens,
      CONTEXT_WINDOW_TOKENS -
        systemTokens -
        userTokens -
        CONTEXT_BUFFER_TOKENS,
    ),
  );

  return {
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: clippedUser },
    ],
    maxOutputTokens: actualCompletion,
  };
}

// ---- JSON parsing (strict, two-step, no heuristic rescue) -----------------

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

/**
 * Strict JSON parse: try raw, then try jsonrepair. That's it.
 * No regex-based fixes, no "collect longest balanced object", no candidate
 * scanning — those are the exact sources of silent different-every-time output.
 */
function parseJsonStrict<T>(text: string): T {
  const cleaned = stripMarkdownFences(text);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to jsonrepair
  }

  try {
    return JSON.parse(jsonrepair(cleaned)) as T;
  } catch (error) {
    throw new Error(
      `HuggingFace did not return valid JSON: ${(error as Error).message}`,
    );
  }
}

// ---- Deterministic HuggingFace call ---------------------------------------

type DeterministicCallOptions = {
  preferredRouterIndex?: number;
  maxOutputTokens: number;
};

async function callHuggingFaceOnce(
  systemMessage: string,
  userContent: string,
  options: DeterministicCallOptions,
): Promise<string> {
  const fitted = fitMessages(
    systemMessage,
    userContent,
    options.maxOutputTokens,
  );

  // Pin router: if the user has a preferred router, use only that one.
  // If not, default to Router 1. This removes router-fallback as a source of
  // variance — same input always hits the same router.
  const result = await generateHuggingFaceTextWithFallback(fitted.messages, {
    maxOutputTokens: fitted.maxOutputTokens,
    preferredRouterIndex: options.preferredRouterIndex ?? 1,
    temperature: 0,
  });

  return result.text;
}

/**
 * Calls HuggingFace and parses JSON. On parse failure, does ONE corrective
 * retry with a "your previous output was invalid" feedback message. After that,
 * throws cleanly.
 */
async function callHuggingFaceJsonDeterministic<T>(
  systemMessage: string,
  userContent: string,
  options: DeterministicCallOptions,
): Promise<T> {
  const firstText = await callHuggingFaceOnce(
    systemMessage,
    userContent,
    options,
  );

  try {
    return parseJsonStrict<T>(firstText);
  } catch (firstError) {
    // One corrective retry. Include the model's bad output so it can see its mistake.
    const correctiveSystem = `${systemMessage}

CRITICAL: Your PREVIOUS output was not valid JSON and was rejected. Output ONLY a single JSON object this time. No markdown fences. No explanation. First character must be \`{\`, last character must be \`}\`. Nothing else.`;

    const truncatedPrevious = firstText.slice(0, 1500);
    const correctiveUser = `${userContent}

(Your previous response was rejected because it was not valid JSON:
${truncatedPrevious}
Return ONLY a valid JSON object now.)`;

    let retryText: string;
    try {
      retryText = await callHuggingFaceOnce(
        correctiveSystem,
        correctiveUser,
        options,
      );
    } catch (retryCallError) {
      throw new Error(
        `HuggingFace JSON parse failed and corrective retry errored: ${(retryCallError as Error).message}. Original parse error: ${(firstError as Error).message}`,
      );
    }

    try {
      return parseJsonStrict<T>(retryText);
    } catch (retryParseError) {
      throw new Error(
        `HuggingFace returned invalid JSON twice (including corrective retry): ${(retryParseError as Error).message}`,
      );
    }
  }
}

// ---- Public API -----------------------------------------------------------

export type HuggingFaceParseOptions = {
  preferredRouterIndex?: number;
};

export type HuggingFaceParseResult = {
  parsedData: ParsedResumeData;
  extractionMeta: ResumeExtractionMeta;
  extractionAudit: ResumeExtractionAudit;
};

const RESUME_SECTIONS: readonly ResumeSectionKey[] = [
  "personalInfo",
  "summary",
  "skills",
  "experience",
  "education",
] as const;

function buildExtractionMeta(
  parsedData: ParsedResumeData,
  rawTextAvailable: boolean,
  issues: Partial<Record<ResumeSectionKey, string[]>> = {},
): ResumeExtractionMeta {
  const meta = createEmptyResumeExtractionMeta();
  meta.rawTextAvailable = rawTextAvailable;
  const nowIso = new Date().toISOString();

  const sectionPopulation: Record<ResumeSectionKey, boolean> = {
    personalInfo: Boolean(
      parsedData.personalInfo.name ||
        parsedData.personalInfo.email ||
        parsedData.personalInfo.phone,
    ),
    summary: Boolean(parsedData.summary.trim()),
    skills: parsedData.skills.length > 0,
    experience: parsedData.experience.length > 0,
    education: parsedData.education.length > 0,
  };

  for (const section of RESUME_SECTIONS) {
    const sectionIssues = issues[section] ?? [];
    const populated = sectionPopulation[section];
    const sectionMeta: ResumeSectionExtractionMeta = {
      source: "ai",
      confidence: populated ? 92 : 60,
      updatedAt: nowIso,
      issues: sectionIssues,
    };
    meta.sections[section] = sectionMeta;
  }

  return normalizeResumeExtractionMeta(meta);
}

/**
 * Single-shot deterministic HuggingFace resume parsing.
 * Returns the same shape as extractResumeSequentially so callers need minimal
 * changes.
 *
 * Determinism guarantees:
 *   - temperature: 0
 *   - pinned router (no cross-router fallback)
 *   - ONE AI call (no sequential section calls)
 *   - ONE corrective retry on invalid JSON (then fail)
 *   - No merge-with-local silent reversion
 */
export async function parseResumeWithHuggingFace(
  rawText: string,
  options: HuggingFaceParseOptions = {},
): Promise<HuggingFaceParseResult> {
  const structure = extractResumeStructureContext(rawText);
  const rawTextAvailable = Boolean(structure.normalizedText.trim());

  const response = await callHuggingFaceJsonDeterministic<unknown>(
    HF_RESUME_PARSING_SYSTEM_MESSAGE,
    buildHuggingFaceParsingUserMessage(rawText),
    {
      preferredRouterIndex: options.preferredRouterIndex,
      maxOutputTokens: PARSE_MAX_OUTPUT_TOKENS,
    },
  );

  const parsedData = normalizeParsedResumeData(response);
  const extractionMeta = buildExtractionMeta(parsedData, rawTextAvailable);
  const extractionAudit = auditResumeExtraction(
    parsedData,
    structure.normalizedText,
  );

  return { parsedData, extractionMeta, extractionAudit };
}

/**
 * Single-shot deterministic HuggingFace resume analysis.
 *
 * On any failure (non-JSON output after corrective retry, network error, etc.)
 * falls back to the deterministic local analyzer — explicit, logged, and NOT
 * a regex-scrape of the AI's reasoning text.
 */
export async function analyzeResumeWithHuggingFace(
  parsedData: ParsedResumeData,
  rawText: string,
  options: HuggingFaceParseOptions = {},
  extractionAudit?: ResumeExtractionAudit,
): Promise<ResumeAnalysisReport> {
  const analysisPrompt = buildResumeAnalysisPrompt(
    parsedData,
    rawText,
    extractionAudit,
  );

  const analysisSystemMessage = `You are a deterministic resume analyzer. Output ONLY a single JSON object that matches the schema described in the user message.

JSON RULES:
- First char \`{\`, last char \`}\`, nothing else.
- No markdown fences, no prose, no explanation.
- Escape internal double-quotes as \\" and backslashes as \\\\.
- No trailing commas, no comments.
- Use numeric scores (0-100) as numbers, not strings.`;

  try {
    const response = await callHuggingFaceJsonDeterministic<unknown>(
      analysisSystemMessage,
      analysisPrompt,
      {
        preferredRouterIndex: options.preferredRouterIndex,
        maxOutputTokens: ANALYSIS_MAX_OUTPUT_TOKENS,
      },
    );

    return normalizeAnalysisReport(response);
  } catch (error) {
    // Clean, explicit fallback. No regex-scraping the AI's free-text output —
    // that path is the #1 cause of "score changes between identical runs".
    console.warn(
      "HuggingFace analysis failed; using deterministic local fallback.",
      error,
    );
    return analyzeResumeFallback(parsedData, rawText);
  }
}
