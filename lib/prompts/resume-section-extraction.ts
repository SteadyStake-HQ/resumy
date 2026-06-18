import {
  clipSectionPromptText,
} from "@/lib/prompts/prompt-utils";
import type { ParsedResumeData, ResumeSectionKey } from "@/lib/resume";

export type ResumeSectionExtractionContext = {
  headerText?: string;
  sectionText?: string;
  parsedSoFar?: Partial<ParsedResumeData>;
  localCandidate?: unknown;
};

type ResumeContentSectionKey = Exclude<ResumeSectionKey, "personalInfo" | "summary">;

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

function getSectionRules(section: ResumeContentSectionKey) {
  switch (section) {
    case "skills":
      return [
        'Return only {"skills":["..."]}',
        'Extract only the skills section.',
        'Preserve explicit groups as "Exact Group: Exact Skill".',
        'The skills array is flat, so repeat the exact group prefix on every skill in that group.',
        'Handle visual labels even when PDF extraction drops the colon: "Languages TypeScript, JavaScript" must become "Languages: TypeScript", "Languages: JavaScript".',
        'Never emit "Group Skill" without the colon. The UI needs "Group: Skill".',
        "Do not invent categories or move skills across groups.",
        "If SECTION contains skills, skills must not be empty.",
      ];
    case "experience":
      return [
        'Return only {"experience":[{"title":"","company":"","location":"","startDate":"","endDate":"","description":[""]}]}',
        "Extract only work experience.",
        "Keep source order and preserve bullets fully.",
        "If SECTION contains visible roles, experience must not be empty.",
      ];
    case "education":
      return [
        'Return only {"education":[{"degree":"","institution":"","year":""}]}',
        "Extract only education.",
        "Keep source order and preserve visible year/date text.",
        "If SECTION contains visible education entries, education must not be empty.",
      ];
  }
}

export function buildResumeSectionExtractionPrompt(
  section: ResumeContentSectionKey,
  context: ResumeSectionExtractionContext = {},
) {
  return [
    `You are a fast resume section extractor for ${section}.`,
    "Return only valid JSON. No markdown. No prose.",
    ...getSectionRules(section),
    "Use SECTION as the primary source. Use HEADER only for top-of-resume context. Use PARSED SO FAR only to avoid duplication or leakage across sections.",
    stringifyContext("HEADER", context.headerText),
    stringifyContext("SECTION", context.sectionText),
    stringifyContext("PARSED SO FAR", context.parsedSoFar),
    stringifyContext("LOCAL CANDIDATE", context.localCandidate),
  ]
    .filter(Boolean)
    .join("\n\n");
}
