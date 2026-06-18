import type { ParsedResumeData, ResumeSectionCompleteness } from "@/lib/resume";
import type { SafeGeneration } from "@/lib/generation";

export type ResumeDiagnostics = {
  score: number;
  sectionCompleteness: ResumeSectionCompleteness;
  snapshot: {
    skills: number;
    experienceEntries: number;
    experienceBullets: number;
    educationEntries: number;
  };
};

export type ResumeComparisonSummary = {
  left: ResumeDiagnostics;
  right: ResumeDiagnostics;
  summaryChanged: boolean;
  skillsOnlyInLeft: string[];
  skillsOnlyInRight: string[];
  rolesOnlyInLeft: string[];
  rolesOnlyInRight: string[];
  educationOnlyInLeft: string[];
  educationOnlyInRight: string[];
};

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function arrayDifference(left: string[], right: string[]) {
  const rightSet = new Set(right.map(normalizeToken));

  return uniqueSorted(
    left.filter((value) => !rightSet.has(normalizeToken(value))),
  );
}

export function buildResumeDiagnostics(
  resumeData: ParsedResumeData,
): ResumeDiagnostics {
  const sectionCompleteness = {
    personalInfo: Boolean(
      resumeData.personalInfo.name || resumeData.personalInfo.email,
    ),
    summary: Boolean(resumeData.summary.trim()),
    skills: resumeData.skills.length > 0,
    experience: resumeData.experience.length > 0,
    education: resumeData.education.length > 0,
  };
  const completedSections = Object.values(sectionCompleteness).filter(Boolean).length;
  const experienceBullets = resumeData.experience.reduce(
    (count, entry) => count + entry.description.length,
    0,
  );
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        completedSections * 14 +
          Math.min(16, resumeData.skills.length * 1.6) +
          Math.min(32, experienceBullets * 3.5) +
          Math.min(12, resumeData.education.length * 6) +
          Math.min(10, Math.floor(resumeData.summary.trim().length / 20)),
      ),
    ),
  );

  return {
    score,
    sectionCompleteness,
    snapshot: {
      skills: resumeData.skills.length,
      experienceEntries: resumeData.experience.length,
      experienceBullets,
      educationEntries: resumeData.education.length,
    },
  };
}

function toExperienceLabels(resumeData: ParsedResumeData) {
  return resumeData.experience.map((entry) =>
    [entry.title, entry.company].filter(Boolean).join(" @ "),
  );
}

function toEducationLabels(resumeData: ParsedResumeData) {
  return resumeData.education.map((entry) =>
    [entry.degree, entry.institution].filter(Boolean).join(" @ "),
  );
}

export function compareResumeData(
  leftResumeData: ParsedResumeData,
  rightResumeData: ParsedResumeData,
): ResumeComparisonSummary {
  return {
    left: buildResumeDiagnostics(leftResumeData),
    right: buildResumeDiagnostics(rightResumeData),
    summaryChanged:
      normalizeToken(leftResumeData.summary) !== normalizeToken(rightResumeData.summary),
    skillsOnlyInLeft: arrayDifference(leftResumeData.skills, rightResumeData.skills),
    skillsOnlyInRight: arrayDifference(rightResumeData.skills, leftResumeData.skills),
    rolesOnlyInLeft: arrayDifference(
      toExperienceLabels(leftResumeData),
      toExperienceLabels(rightResumeData),
    ),
    rolesOnlyInRight: arrayDifference(
      toExperienceLabels(rightResumeData),
      toExperienceLabels(leftResumeData),
    ),
    educationOnlyInLeft: arrayDifference(
      toEducationLabels(leftResumeData),
      toEducationLabels(rightResumeData),
    ),
    educationOnlyInRight: arrayDifference(
      toEducationLabels(rightResumeData),
      toEducationLabels(leftResumeData),
    ),
  };
}

export function compareGenerations(
  leftGeneration: SafeGeneration,
  rightGeneration: SafeGeneration,
) {
  return compareResumeData(leftGeneration.tailoredData, rightGeneration.tailoredData);
}
