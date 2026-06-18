import { clipSectionPromptText } from "@/lib/prompts/prompt-utils";
import type { ParsedResumeData } from "@/lib/resume";

type ResumeSummaryExtractionContext = {
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

export function buildResumeSummaryExtractionPrompt(
  context: ResumeSummaryExtractionContext = {},
) {
  return [
    "You are a dedicated resume summary extractor. Extract summary only.",
    "Return only valid JSON. No markdown. No prose.",
    'Return only {"summary":""}',
    "This prompt is isolated from profile extraction. Never extract or correct name, title, email, phone, location, skills, experience, or education.",
    "Extract only the visible summary/profile/about/about me/objective/professional overview block.",
    "Use SECTION as the primary source. HEADER is only for top-of-resume context if SECTION is empty or the summary is an unheaded top paragraph.",
    "LOCAL CANDIDATE is untrusted fallback data. If LOCAL CANDIDATE is missing the opening line or contains only ending sentences, ignore it and restore the full summary from SECTION.",
    "When SECTION appears to be the full resume because no summary slice was detected, scan from the top for the explicit summary heading and extract only the text beneath it until the next real section heading.",
    "If SECTION is empty or too sparse, inspect HEADER for a standalone professional paragraph directly below the candidate name/title/contact block and before the first real section. Extract that paragraph as summary when it is 25+ words and reads like a career overview.",
    'Treat letter-spaced headings as normal summary headings, for example "A B O U T  M E" means "ABOUT ME" and "P R O F E S S I O N A L  S U M M A R Y" means "PROFESSIONAL SUMMARY".',
    "If SECTION starts with or was captured from an About Me/About/Profile/Summary/Professional Summary heading, copy the paragraph text beneath that heading into summary.",
    'For a block headed "A B O U T  M E", the returned summary must start with the first prose sentence under that heading.',
    'Example: if ABOUT ME starts "Full-stack software engineer with nearly 10 years of experience..." and later continues "Skilled across frontend development...", the returned summary must include BOTH parts and must start with "Full-stack software engineer...".',
    'For a block headed "P R O F E S S I O N A L  S U M M A R Y", summary must be the paragraph after that heading. Do not return empty unless there is truly no paragraph after the heading.',
    'Also recognize similar headings such as "Career Summary", "Profile Summary", "Summary of Qualifications", "Qualifications Summary", "Executive Summary", "Executive Profile", "Career Profile", "Professional Profile", "Professional Overview", "Overview", "Intro", "Introduction", "Personal Statement", "About", and "Background".',
    "A summary can appear without a heading when it is a prose paragraph near the top. Do not require a heading if the text is clearly not contact info, not a role/date/company row, not a skill list, and not an experience bullet.",
    "Preserve the full block. Do not shorten, paraphrase, summarize, rank, or choose only the most recent/last paragraph.",
    "Include every sentence and line in SECTION until the next real section header; do not stop after the first sentence, first paragraph, final paragraph, or a blank line inside the same summary block.",
    "If SECTION contains multiple summary paragraphs, concatenate all of them in reading order into one coherent summary string. Blank lines inside SECTION separate paragraphs; they do not end the summary.",
    "The summary may be a first-person paragraph; keep first-person wording exactly as written instead of rejecting it.",
    "Do not reject a summary just because it contains pronouns, soft skills, personality, or career motivation.",
    "Do not return contact details, name, title, education, skill lists, or work-experience bullets as summary.",
    "If SECTION is present and contains summary text, summary must not be empty.",
    stringifyContext("HEADER", context.headerText),
    stringifyContext("SECTION", context.sectionText),
    stringifyContext("LOCAL CANDIDATE", context.localCandidate),
  ]
    .filter(Boolean)
    .join("\n\n");
}
