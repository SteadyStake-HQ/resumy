import type { ParsedResumeData } from "@/lib/resume";
import type { ResumeExtractionAudit } from "@/lib/resume-processing";
import { clipAnalysisRawContext } from "@/lib/prompts/prompt-utils";
import {
  RESUME_ANALYSIS_CORE_SECTION,
  RESUME_ANALYSIS_EVALUATION_SECTION,
  RESUME_ANALYSIS_SCHEMA_SECTION,
  RESUME_ANALYSIS_SCORING_SECTION,
  RESUME_ANALYSIS_TIPS_SECTION,
} from "@/lib/prompts/resume-analysis-sections";

export function buildResumeAnalysisPrompt(
  parsedData: ParsedResumeData,
  rawContext: string,
  extractionAudit?: ResumeExtractionAudit,
) {
  return [
    ...RESUME_ANALYSIS_CORE_SECTION,
    ...RESUME_ANALYSIS_SCHEMA_SECTION,
    ...RESUME_ANALYSIS_EVALUATION_SECTION,
    ...RESUME_ANALYSIS_SCORING_SECTION,
    ...RESUME_ANALYSIS_TIPS_SECTION,
    "",
    "========================",
    "INPUT",
    "=====",
    "",
    "PARSED RESUME DATA:",
    JSON.stringify(parsedData, null, 2),
    "",
    extractionAudit
      ? ["EXTRACTION AUDIT:", JSON.stringify(extractionAudit, null, 2), ""].join(
          "\n",
        )
      : "",
    rawContext.trim()
      ? ["RAW RESUME CONTEXT:", clipAnalysisRawContext(rawContext), ""].join("\n")
      : "",
    "",
    "========================",
    "FINAL INSTRUCTION",
    "=================",
    "",
    "Return ONLY valid JSON.",
    "Do NOT include explanations or extra text.",
  ].join("\n");
}
