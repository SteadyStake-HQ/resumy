import { clipResumePromptText } from "@/lib/prompts/prompt-utils";
import { RESUME_PARSING_EDUCATION_SECTION } from "@/lib/prompts/resume-parsing-sections/education";
import { RESUME_PARSING_EXPERIENCE_SECTION } from "@/lib/prompts/resume-parsing-sections/experience";
import { RESUME_PARSING_GENERAL_SECTION } from "@/lib/prompts/resume-parsing-sections/general";
import { RESUME_PARSING_NORMALIZATION_SECTION } from "@/lib/prompts/resume-parsing-sections/normalization";
import { RESUME_PARSING_SKILLS_SECTION } from "@/lib/prompts/resume-parsing-sections/skills";
import { RESUME_PARSING_VALIDATION_SECTION } from "@/lib/prompts/resume-parsing-sections/validation";

const RESUME_PARSING_SYSTEM_PROMPT = [
  RESUME_PARSING_GENERAL_SECTION,
  RESUME_PARSING_NORMALIZATION_SECTION,
  RESUME_PARSING_SKILLS_SECTION,
  RESUME_PARSING_EXPERIENCE_SECTION,
  RESUME_PARSING_EDUCATION_SECTION,
  RESUME_PARSING_VALIDATION_SECTION,
].join("\n\n");

export function buildResumeParsingPrompt(rawText: string) {
  return `${RESUME_PARSING_SYSTEM_PROMPT}

RESUME TEXT:
${clipResumePromptText(rawText)}`;
}
