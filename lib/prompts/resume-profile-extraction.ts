import { clipSectionPromptText } from "@/lib/prompts/prompt-utils";
import type { ParsedResumeData } from "@/lib/resume";

type ResumeProfileExtractionContext = {
  headerText?: string;
  sectionText?: string;
  parsedSoFar?: Partial<ParsedResumeData>;
  localCandidate?: unknown;
};

function stringifyContext(label: string, value: unknown) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? `${label}:\n${clipSectionPromptText(trimmed)}` : "";
  }

  return `${label}:\n${JSON.stringify(value, null, 2)}`;
}

export function buildResumeProfileExtractionPrompt(
  context: ResumeProfileExtractionContext = {},
) {
  return [
    "You are a dedicated resume profile extractor. Extract personalInfo only.",
    "Return only valid JSON. No markdown. No prose.",
    'Return only {"personalInfo":{"name":"","title":"","email":"","phone":"","location":"","links":[{"type":"","label":"","url":""}]}}',
    "This prompt is isolated from summary, skills, experience, and education extraction. Never extract summary text, skill headings, work history, or education into personalInfo.",
    "HEADER is the authoritative source for profile fields. SECTION is provided only because some PDF parsers place the same header text there; ignore any SECTION content that appears below the first section heading.",
    "LOCAL CANDIDATE is untrusted fallback data. Use it only when the same value is visibly supported by HEADER or the top identity block. If LOCAL CANDIDATE conflicts with HEADER, ignore LOCAL CANDIDATE.",
    "Name is the human candidate name only. Prefer the large standalone top name line. Do not use role titles, company names, section headings, taglines, skill clusters, or phrases separated by bullets/dots/pipes as the name.",
    'Example: "Denis Napierala" is the name. "TECHSTACK&SKILLS" is a section/skill heading and must NOT become the name.',
    'Example: "DIEGO VEGA" is the name. "Backend · AI · Blockchain" is a skill/tagline cluster and must NOT become the name.',
    "Title is the visible profile headline directly near the name, usually just below the name. Extract it even when it has no label.",
    'If the top headline is letter-spaced, collapse it: "S E N I O R  S O F T W A R E  E N G I N E E R" means "Senior Software Engineer".',
    'Do not use work-history rows as title. Example: "Senior Backend Engineer | SteadyStake Aug 2025 - Mar 2026 | Remote" is experience, not personalInfo.title.',
    "Email, phone, and location should be extracted when visible in the header/contact line.",
    'Location is the visible contact location only. For a header contact item like "Krasnystaw, Lubelskie, Poland" or "Bogotá, Colombia", return only that contact location. Do not append education, employer, university, work mode, or later section text.',
    "Extract visible links only. Preserve explicit LinkedIn/GitHub/portfolio/website links or labeled profile link text.",
    "If name, title, location, email, or phone is visible in HEADER, that field must not be empty.",
    stringifyContext("HEADER", context.headerText),
    stringifyContext("SECTION", context.sectionText),
    stringifyContext("LOCAL CANDIDATE", context.localCandidate),
  ]
    .filter(Boolean)
    .join("\n\n");
}
