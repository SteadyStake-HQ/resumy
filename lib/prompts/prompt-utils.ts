export const MAX_RESUME_PROMPT_CHARS = 42000;
export const MAX_SECTION_PROMPT_CHARS = 12000;
export const MAX_ANALYSIS_RAW_CONTEXT_CHARS = 12000;

export function clipResumePromptText(rawText: string) {
  return rawText.trim().slice(0, MAX_RESUME_PROMPT_CHARS);
}

export function clipSectionPromptText(rawText: string) {
  return rawText.trim().slice(0, MAX_SECTION_PROMPT_CHARS);
}

export function clipAnalysisRawContext(rawText: string) {
  return rawText.trim().slice(0, MAX_ANALYSIS_RAW_CONTEXT_CHARS);
}
