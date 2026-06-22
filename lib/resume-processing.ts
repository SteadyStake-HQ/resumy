import {
  type ParsedResumeData,
  type ResumeSectionKey,
  type ResumeAnalysisReport,
} from "@/lib/resume";
import { parseWithValidation, preprocessResumeText } from "@/lib/resume-parser";
import {
  extractPhoneFromText,
  extractProfileLinksFromText,
} from "@/lib/contact-info";
import { formatResumeLocation } from "@/lib/location";

const EXPERIENCE_HEADINGS = [
  "experience",
  "work experience",
  "professional experience",
  "employment history",
  "career history",
  "work history",
  "relevant experience",
  "professional background",
];

const EDUCATION_HEADINGS = [
  "education",
  "academic background",
  "qualifications",
  "training",
  "certifications",
  "education and certifications",
  "education & certifications",
  "licenses and certifications",
];

const SKILL_HEADINGS = [
  "skills",
  "technical skills",
  "tech stack & skills",
  "tech stack and skills",
  "core skills",
  "core competencies",
  "expertise",
  "technical proficiencies",
  "technologies",
  "tools",
  "tools and technologies",
  "skills and tools",
  "skills & tools",
  "tech stack",
  "technical stack",
  "technology stack",
  "technologies and tools",
  "technologies & tools",
  "competencies",
];
const SUMMARY_HEADINGS = [
  "summary",
  "professional summary",
  "career summary",
  "profile summary",
  "summary of qualifications",
  "qualifications summary",
  "executive summary",
  "executive profile",
  "career profile",
  "professional profile",
  "professional overview",
  "profile",
  "about",
  "about me",
  "aboutme",
  "objective",
  "overview",
  "introduction",
  "intro",
  "personal statement",
  "background",
];

const SUPPORTED_RESUME_EXTENSIONS = new Set([".pdf", ".docx", ".txt"]);
const COMMON_RESUME_KEYWORDS = [
  "leadership",
  "communication",
  "collaboration",
  "ownership",
  "strategy",
  "analysis",
  "optimization",
  "stakeholder",
  "results",
  "automation",
];
const LOCAL_PARSE_CONFIDENCE_THRESHOLD = 64;

const DATE_TOKEN_PATTERN =
  String.raw`(?:[A-Za-z]{3,9}\s+\d{4}|(?:0?[1-9]|1[0-2])[\/.-]\d{4}|\d{4})`;
const DATE_RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN_PATTERN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN_PATTERN}|present|current|now)`,
  "i",
);
const EXPLICIT_BULLET_PATTERN = /^\s*[-*•▪◦●]\s+/;
const ROLE_KEYWORD_PATTERN =
  /\b(engineer|developer|manager|analyst|designer|architect|founder|director|lead|consultant|specialist|coordinator|intern|owner|president|officer|administrator|scientist)\b/i;
const ACTION_VERB_PATTERN =
  /^(developed|engineered|designed|implemented|built|created|launched|led|managed|owned|optimized|improved|delivered|collaborated|partnered|guided|drove|supported|scaled|automated|reduced|increased|grew|analyzed|architected|deployed|maintained)\b/i;
const WORK_MODE_PATTERN = /\b(remote|hybrid|on[\s-]?site|onsite)\b/i;
const BULLET_CONTINUATION_PATTERN =
  /^(and|or|with|for|to|from|on|in|of|by|via|using|through|across|including|while|where|that)\b/i;
const EDUCATION_YEAR_PATTERN =
  /\b(?:[A-Za-z]{3,9}\s+)?(?:19|20)\d{2}(?:\s*(?:-|–|—|to)\s*(?:[A-Za-z]{3,9}\s+)?(?:present|current|now|(?:19|20)\d{2}))?\b/i;
const EDUCATION_INSTITUTION_PATTERN =
  /\b(university|college|school|institute|academy|polytechnic|faculty|campus|seminary|conservatory)\b/i;
const DEGREE_KEYWORD_PATTERN =
  /\b(bachelor|master|mba|ph\.?d|doctor|associate|b\.?sc|bsc|bs\b|ba\b|m\.?sc|msc|ms\b|ma\b|beng|meng|diploma|certificate|certification|bootcamp|course)\b/i;
const SKILL_GROUP_LABELS = [
  "languages",
  "frontend",
  "front end",
  "backend",
  "back end",
  "databases",
  "database",
  "ci/cd & tooling",
  "ci/cd and tooling",
  "ci cd tooling",
  "cicd tooling",
  "monitoring",
  "testing",
  "methodologies",
  "cloud & devops",
  "cloud and devops",
  "devops & cloud",
  "devops and cloud",
  "cloud",
  "devops",
  "ai & ml",
  "ai and ml",
  "ai / ml",
  "ai/ml",
  "data & ai / ml",
  "data and ai / ml",
  "data & ai",
  "data and ai",
  "machine learning",
  "blockchain & web3",
  "blockchain and web3",
  "blockchain",
  "data engineering",
  "aws & cloud",
  "aws and cloud",
  "cloud & aws",
  "testing & tools",
  "testing and tools",
  "tools & testing",
  "tools and testing",
];
const SKILL_GROUP_LABEL_PATTERN = new RegExp(
  `^(?:${SKILL_GROUP_LABELS.map((label) =>
    escapeRegExp(label).replace(/\\ /g, "\\s+"),
  ).join("|")})\\s*:?\\s*`,
  "i",
);
const TECH_SKILL_SIGNAL_PATTERN =
  /\b(?:javascript|typescript|python|java|solidity|sql|nosql|bash|shell|react|next\.?js|tailwind|html5|css3|websockets?|node\.?js|express\.?js|fastify|rest\s+apis?|graphql|microservices|postgresql|mongodb|redis|bigquery|elasticsearch|aws|gcp|azure|docker|kubernetes|terraform|ci\/cd|llm|ai|rag|langchain|llamaindex|ethereum|evm|defi|hardhat|foundry|ipfs|spark|airflow|dbt|etl)\b/i;
const KNOWN_MULTI_WORD_SKILL_PATTERN =
  /\b(?:smart\s+contracts?|vector\s+(?:dbs?|databases?)|data\s+warehousing|data\s+engineering|etl\s+design|machine\s+learning|deep\s+learning|cloud\s+computing|system\s+design|software\s+architecture|distributed\s+systems|unit\s+testing|integration\s+testing)\b/i;
const TECH_PUNCTUATION_PATTERN = /[.+#/]/;
const SENTENCE_CONNECTOR_PATTERN =
  /\b(?:across|with|from|for|into|using|through|while|where|that|their|your|our)\b/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ResumeSectionTextMap = Record<
  Exclude<ResumeSectionKey, "personalInfo">,
  string
>;

export type LocalResumeSectionCandidates = {
  normalizedText: string;
  headerText: string;
  sections: ResumeSectionTextMap;
  parsedData: ParsedResumeData;
};

export type ResumeExtractionAudit = Record<ResumeSectionKey, string[]>;
function normalizeHeadingCandidate(value: string) {
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);

  if (tokens.length >= 2 && tokens.every((token) => /^[a-z0-9]$/.test(token))) {
    return tokens.join("");
  }

  if (
    tokens.length >= 3 &&
    tokens.filter((token) => /^[a-z0-9]$/.test(token)).length >= tokens.length - 1 &&
    tokens.some((token) => token === "and")
  ) {
    return tokens.map((token) => (token === "and" ? "and" : token)).join("");
  }

  return normalized;
}

function createHeadingSet(headings: string[]) {
  return new Set(
    headings.flatMap((heading) => {
      const normalized = normalizeHeadingCandidate(heading);
      return [normalized, normalized.replace(/\s+/g, "")];
    }),
  );
}

const SUMMARY_HEADING_SET = createHeadingSet(SUMMARY_HEADINGS);
const SKILL_HEADING_SET = createHeadingSet(SKILL_HEADINGS);
const EXPERIENCE_HEADING_SET = createHeadingSet(EXPERIENCE_HEADINGS);
const EDUCATION_HEADING_SET = createHeadingSet(EDUCATION_HEADINGS);

let isPdfWorkerConfigured = false;
let pdfParseModule: typeof import("pdf-parse") | null = null;
let mammothModule: typeof import("mammoth") | null = null;
let pdfWorkerModulePromise: Promise<void> | null = null;

function getPdfParseModule() {
  if (!pdfParseModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pdfParseModule = require("pdf-parse") as typeof import("pdf-parse");
  }

  return pdfParseModule;
}

function getMammothModule() {
  if (!mammothModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mammothModule = require("mammoth") as typeof import("mammoth");
  }

  return mammothModule;
}

function loadPdfWorkerModule() {
  const runtimeRequire = eval("require") as NodeRequire;
  const workerModuleName = ["pdf-parse", "worker"].join("/");

  runtimeRequire(workerModuleName);
}

function waitForPdfWorkerReady(timeoutMs = 1000) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();

    const checkReady = () => {
      const workerMessageHandler = (
        globalThis as typeof globalThis & {
          pdfjsWorker?: { WorkerMessageHandler?: unknown };
        }
      ).pdfjsWorker?.WorkerMessageHandler;

      if (workerMessageHandler) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("The PDF worker could not be loaded on the server."));
        return;
      }

      setTimeout(checkReady, 10);
    };

    checkReady();
  });
}

async function ensurePdfWorkerConfigured() {
  if (isPdfWorkerConfigured) {
    return;
  }

  if (!pdfWorkerModulePromise) {
    pdfWorkerModulePromise = Promise.resolve().then(() => {
      loadPdfWorkerModule();
      getPdfParseModule();
      return waitForPdfWorkerReady();
    });
  }

  await pdfWorkerModulePromise;
  isPdfWorkerConfigured = true;
}

export function extractDocumentTitleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanBullet(line: string) {
  return line.replace(EXPLICIT_BULLET_PATTERN, "").trim();
}

function isNoiseLine(line: string) {
  return (
    /^-*\s*\d+\s+of\s+\d+\s*-*$/i.test(line) ||
    /^page\s+\d+$/i.test(line) ||
    /^page\s+\d+\s+of\s+\d+$/i.test(line)
  );
}

function getFileExtension(fileName: string) {
  const normalizedFileName = fileName.toLowerCase();
  const extensionIndex = normalizedFileName.lastIndexOf(".");
  return extensionIndex >= 0 ? normalizedFileName.slice(extensionIndex) : "";
}

function matchResumeSectionHeading(line: string) {
  const normalizedLine = normalizeHeadingCandidate(line.replace(/:$/, ""));

  if (!normalizedLine || normalizedLine.split(/\s+/).length > 6) {
    return null;
  }

  if (SUMMARY_HEADING_SET.has(normalizedLine)) {
    return "summary" as const;
  }

  if (SKILL_HEADING_SET.has(normalizedLine)) {
    return "skills" as const;
  }

  if (EXPERIENCE_HEADING_SET.has(normalizedLine)) {
    return "experience" as const;
  }

  if (EDUCATION_HEADING_SET.has(normalizedLine)) {
    return "education" as const;
  }

  return null;
}

function isLikelyHeading(line: string) {
  return Boolean(matchResumeSectionHeading(line));
}

function splitResumeIntoSections(rawText: string) {
  const lines = rawText.split("\n").map((line) => line.trim());
  const sections = {
    summary: [] as string[],
    skills: [] as string[],
    experience: [] as string[],
    education: [] as string[],
  };

  let activeSection: keyof typeof sections | null = null;

  for (const line of lines) {
    if (!line) {
      if (activeSection) {
        sections[activeSection].push("");
      }

      continue;
    }

    const matchedHeading = matchResumeSectionHeading(line);

    if (matchedHeading) {
      activeSection = matchedHeading;
      continue;
    }

    if (activeSection) {
      if (!isNoiseLine(line)) {
        sections[activeSection].push(line);
      }
    }
  }

  return {
    summary: normalizeWhitespace(sections.summary.join("\n")),
    skills: normalizeWhitespace(sections.skills.join("\n")),
    experience: normalizeWhitespace(sections.experience.join("\n")),
    education: normalizeWhitespace(sections.education.join("\n")),
  };
}

function extractHeaderText(rawText: string) {
  const lines = rawText.split("\n");
  const firstSectionIndex = findFirstSectionIndex(rawText);
  const boundary = firstSectionIndex >= 0 ? firstSectionIndex : Math.min(lines.length, 12);

  return normalizeWhitespace(lines.slice(0, boundary).join("\n"));
}

function findFirstSectionIndex(rawText: string) {
  const lines = rawText.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    if (matchResumeSectionHeading(lines[index] ?? "")) {
      return index;
    }
  }

  return -1;
}

function extractName(rawText: string) {
  const candidates = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isLikelyHeading(line))
    .filter((line) => !line.includes("@"))
    .filter((line) => !/\d{3}/.test(line))
    .filter((line) => line.length <= 60);

  return candidates[0] ?? "";
}

function extractTitle(rawText: string, name: string) {
  const normalizedName = normalizeHeadingCandidate(name);
  const headerLines = rawText
    .split("\n")
    .map((line) => normalizeInlineSpaces(line))
    .filter(Boolean)
    .slice(0, 10);

  for (const line of headerLines) {
    const normalizedLine = normalizeHeadingCandidate(line);

    if (
      !line ||
      normalizedLine === normalizedName ||
      isLikelyHeading(line) ||
      line.includes("@") ||
      /(?:https?:\/\/|linkedin\.com|github\.com|gitlab\.com|bitbucket\.org)/i.test(line) ||
      /\+?\d[\d\s().-]{6,}/.test(line) ||
      formatResumeLocation(line) ||
      line.length > 100
    ) {
      continue;
    }

    if (ROLE_KEYWORD_PATTERN.test(line)) {
      return line.replace(/\s+[|•·]\s+/g, " | ");
    }
  }

  return "";
}

function extractLocation(rawText: string) {
  const candidates = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes("@"))
    .filter((line) => !/\+?\d[\d\s().-]{6,}/.test(line))
    .filter((line) => line.length <= 80);

  for (const candidate of candidates) {
    const formattedLocation = formatResumeLocation(candidate);

    if (formattedLocation) {
      return formattedLocation;
    }
  }

  return "";
}

function extractPhone(rawText: string) {
  return extractPhoneFromText(rawText);
}

function looksLikeSkillSourceLine(line: string) {
  const normalizedLine = normalizeInlineSpaces(cleanBullet(line));

  if (
    !normalizedLine ||
    isNoiseLine(normalizedLine) ||
    isLikelyHeading(normalizedLine) ||
    looksLikeDateLine(normalizedLine) ||
    normalizedLine.includes("@") ||
    /\+?\d[\d\s().-]{6,}/.test(normalizedLine)
  ) {
    return false;
  }

  const separatorCount = (normalizedLine.match(/[;,|•▪◦●]/g) ?? []).length;
  const wordCount = normalizedLine.split(/\s+/).length;
  const candidateParts = normalizedLine
    .split(/,|;|\||•|▪|◦|●|\s+\/\s+/)
    .map((part) => cleanSkillEntry(part))
    .filter(Boolean);
  const validSkillParts = candidateParts.filter((part) =>
    looksLikeSkillItem(part),
  );

  if (SKILL_GROUP_LABEL_PATTERN.test(normalizedLine)) {
    return true;
  }

  if (
    separatorCount >= 2 &&
    wordCount <= 36 &&
    validSkillParts.length >= 3 &&
    validSkillParts.length >= Math.max(3, Math.ceil(candidateParts.length / 2))
  ) {
    return true;
  }

  return isExplicitBulletLine(line) && wordCount <= 4 && !/[.!?]$/.test(normalizedLine);
}

function cleanSkillEntry(value: string) {
  return normalizeInlineSpaces(cleanBullet(value))
    .replace(SKILL_GROUP_LABEL_PATTERN, "")
    .replace(/[.:]+$/, "")
    .trim();
}

function looksLikeExplicitSkillCategoryLabel(group: string, skillsText: string) {
  const normalizedGroup = normalizeInlineSpaces(group);
  const normalizedSkillsText = normalizeInlineSpaces(skillsText);

  if (
    !normalizedGroup ||
    normalizedGroup.length > 48 ||
    normalizedGroup.includes("@") ||
    /\+?\d[\d\s().-]{6,}/.test(normalizedGroup) ||
    looksLikeDateLine(normalizedGroup) ||
    isLikelyHeading(normalizedGroup)
  ) {
    return false;
  }

  const groupWordCount = normalizedGroup.split(/\s+/).length;

  if (groupWordCount > 6) {
    return false;
  }

  return Boolean(
    SKILL_GROUP_LABEL_PATTERN.test(`${normalizedGroup}:`) ||
      /[;,|•▪◦●]/.test(normalizedSkillsText) ||
      /\s+\/\s+/.test(normalizedSkillsText) ||
      hasSkillSignal(normalizedSkillsText),
  );
}

function splitSkillItems(skillsText: string) {
  const entries: string[] = [];
  let current = "";
  let depth = 0;

  for (const character of skillsText) {
    if (character === "(") {
      depth += 1;
      current += character;
      continue;
    }

    if (character === ")") {
      depth = Math.max(0, depth - 1);
      current += character;
      continue;
    }

    if ((character === "," || character === ";" || character === "|" || character === "•" || character === "▪" || character === "◦" || character === "●") && depth === 0) {
      const entry = cleanSkillEntry(current);

      if (entry) {
        entries.push(entry);
      }

      current = "";
      continue;
    }

    current += character;
  }

  const finalEntry = cleanSkillEntry(current);

  if (finalEntry) {
    entries.push(finalEntry);
  }

  return entries;
}

function combineWrappedSkillLines(lines: string[]) {
  const combined: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeInlineSpaces(cleanBullet(rawLine));

    if (!line) {
      continue;
    }

    const previous = combined[combined.length - 1] ?? "";

    if (
      previous &&
      !SKILL_GROUP_LABEL_PATTERN.test(line) &&
      (
        /\([^)]*$/.test(previous) ||
        /[/:-]$/.test(previous) ||
        !/[.!?]$/.test(previous)
      )
    ) {
      combined[combined.length - 1] = normalizeInlineSpaces(`${previous} ${line}`);
      continue;
    }

    combined.push(line);
  }

  return combined;
}

function splitInlineSkillCategoryCollisions(line: string) {
  const normalizedLine = normalizeInlineSpaces(cleanBullet(line));

  const segments: string[] = [];
  const categoryPattern = normalizedLine.includes(":")
    ? /(^|\s)([A-Za-z][A-Za-z0-9/&+ .-]{1,47}):\s*/g
    : new RegExp(
        `(^|\\s)(${SKILL_GROUP_LABELS
          .slice()
          .sort((left, right) => right.length - left.length)
          .map((label) => escapeRegExp(label).replace(/\\ /g, "\\s+"))
          .join("|")})\\s+`,
        "gi",
      );
  const matches = Array.from(normalizedLine.matchAll(categoryPattern));

  if (matches.length < 2 && !normalizedLine.includes(":")) {
    return [normalizedLine];
  }

  if (!matches.length) {
    return [normalizedLine];
  }

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const startIndex = (match.index ?? 0) + (match[1]?.length ?? 0);
    const endIndex = nextMatch ? (nextMatch.index ?? normalizedLine.length) : normalizedLine.length;
    const segment = normalizedLine.slice(startIndex, endIndex).trim();

    if (segment) {
      segments.push(segment);
    }
  }

  return segments.length ? segments : [normalizedLine];
}

function extractSkillGroupFromLine(line: string) {
  const cleanedLine = normalizeInlineSpaces(cleanBullet(line));
  const labelMatch = cleanedLine.match(/^([^:]{2,48}):\s*(.+)$/);

  if (labelMatch) {
    const [, group, skillsText] = labelMatch;

    if (looksLikeExplicitSkillCategoryLabel(group, skillsText)) {
      return {
        group: group.trim(),
        skillsText: skillsText.trim(),
      };
    }
  }

  for (const groupLabel of SKILL_GROUP_LABELS) {
    const match = cleanedLine.match(
      new RegExp(`^(${escapeRegExp(groupLabel).replace(/\\ /g, "\\s+")})\\s+(.+)$`, "i"),
    );

    if (!match) {
      continue;
    }

    const group = match[1]?.trim() ?? "";
    const skillsText = match[2]?.trim() ?? "";

    if (looksLikeExplicitSkillCategoryLabel(group, skillsText)) {
      return {
        group,
        skillsText,
      };
    }
  }

  return {
    group: "",
    skillsText: cleanedLine,
  };
}

function hasSkillSignal(value: string) {
  return (
    TECH_PUNCTUATION_PATTERN.test(value) ||
    TECH_SKILL_SIGNAL_PATTERN.test(value) ||
    KNOWN_MULTI_WORD_SKILL_PATTERN.test(value)
  );
}

function looksLikeSkillItem(value: string) {
  const normalizedValue = normalizeInlineSpaces(value);

  if (
    !normalizedValue ||
    isLikelyHeading(normalizedValue) ||
    looksLikeDateLine(normalizedValue) ||
    normalizedValue.includes("@") ||
    /\+?\d[\d\s().-]{6,}/.test(normalizedValue)
  ) {
    return false;
  }

  const wordCount = normalizedValue.split(/\s+/).length;

  if (wordCount > 6) {
    return false;
  }

  if (wordCount >= 4 && !hasSkillSignal(normalizedValue)) {
    return false;
  }

  if (
    wordCount >= 5 &&
    SENTENCE_CONNECTOR_PATTERN.test(normalizedValue) &&
    !KNOWN_MULTI_WORD_SKILL_PATTERN.test(normalizedValue)
  ) {
    return false;
  }

  if (ROLE_KEYWORD_PATTERN.test(normalizedValue) && wordCount > 2) {
    return false;
  }

  if (ACTION_VERB_PATTERN.test(normalizedValue) && wordCount > 2) {
    return false;
  }

  return normalizedValue.length >= 2 && normalizedValue.length <= 48;
}

function extractSkills(sectionText: string, rawText: string) {
  const candidateSkillLines = (
    sectionText
      ? sectionText.split("\n")
      : rawText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => looksLikeSkillSourceLine(line))
  ).filter(Boolean);

  const rawSkillLines = combineWrappedSkillLines(
    candidateSkillLines.flatMap((line) => splitInlineSkillCategoryCollisions(line)),
  );

  const extractedSkills: string[] = [];

  for (const line of rawSkillLines) {
    const { group, skillsText } = extractSkillGroupFromLine(line);

    for (const entry of splitSkillItems(skillsText)) {
      const cleanedEntry = cleanSkillEntry(entry);
      const skillEntry = group ? `${group}: ${cleanedEntry}` : cleanedEntry;

      if (!looksLikeSkillItem(cleanedEntry)) {
        continue;
      }

      extractedSkills.push(skillEntry);
    }
  }

  return extractedSkills.slice(0, 200);
}

function normalizeInlineSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isExplicitBulletLine(line: string) {
  return EXPLICIT_BULLET_PATTERN.test(line);
}

function looksLikeDateLine(text: string) {
  return DATE_RANGE_PATTERN.test(text);
}

function parseDateRange(text: string) {
  const rangeMatch = text.match(DATE_RANGE_PATTERN);

  if (!rangeMatch) {
    return {
      startDate: "",
      endDate: "",
    };
  }

  return {
    startDate: rangeMatch[1].trim(),
    endDate: rangeMatch[2].trim(),
  };
}

function stripDateRange(text: string) {
  return normalizeInlineSpaces(text.replace(DATE_RANGE_PATTERN, " "));
}

function looksLikeLocationLine(text: string) {
  return Boolean(formatResumeLocation(text) || (WORK_MODE_PATTERN.test(text) && /,/.test(text)));
}

function looksLikeDescriptionLine(text: string) {
  const normalizedText = normalizeInlineSpaces(text);

  if (
    !normalizedText ||
    isLikelyHeading(normalizedText) ||
    looksLikeDateLine(normalizedText) ||
    looksLikeLocationLine(normalizedText)
  ) {
    return false;
  }

  const wordCount = normalizedText.split(/\s+/).length;

  return (
    wordCount >= 7 ||
    ACTION_VERB_PATTERN.test(normalizedText) ||
    (wordCount >= 5 &&
      (/[,:;]/.test(normalizedText) || /\b\d+(?:[.,]\d+)?(?:%|\+|x)?\b/.test(normalizedText)))
  );
}

function hasRoleKeyword(text: string) {
  return ROLE_KEYWORD_PATTERN.test(text);
}

function findNextNonEmptyLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]?.trim();

    if (line) {
      return line;
    }
  }

  return "";
}

function isLikelyExperienceHeader(
  line: string,
  nextLine: string,
  followingLine: string,
) {
  const normalizedLine = normalizeInlineSpaces(cleanBullet(line));

  if (
    !normalizedLine ||
    isNoiseLine(normalizedLine) ||
    isLikelyHeading(normalizedLine) ||
    isExplicitBulletLine(line) ||
    looksLikeDateLine(normalizedLine) ||
    looksLikeLocationLine(normalizedLine)
  ) {
    return false;
  }

  const lineWithoutDates = stripDateRange(normalizedLine);
  const nearbyMetadata =
    looksLikeDateLine(nextLine) ||
    looksLikeDateLine(followingLine) ||
    looksLikeLocationLine(nextLine) ||
    looksLikeLocationLine(followingLine);
  const hasSeparator =
    /\s+at\s+/i.test(lineWithoutDates) ||
    /\s+\|\s+/.test(lineWithoutDates) ||
    /\s[-–—]\s/.test(lineWithoutDates) ||
    lineWithoutDates.includes(",");

  return Boolean(
    (hasRoleKeyword(lineWithoutDates) && (hasSeparator || nearbyMetadata)) ||
      (looksLikeDateLine(normalizedLine) && hasRoleKeyword(lineWithoutDates)) ||
      (hasSeparator && nearbyMetadata),
  );
}

function blockHasExperienceMetadata(lines: string[]) {
  return lines.some((line) => {
    const normalizedLine = normalizeInlineSpaces(line);
    return looksLikeDateLine(normalizedLine) || looksLikeLocationLine(normalizedLine);
  });
}

function splitExperienceIntoBlocks(sectionText: string) {
  const lines = sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line || !isNoiseLine(line));
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let currentBlockHasNarrative = false;
  let encounteredGap = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line) {
      encounteredGap = currentBlock.length > 0;
      continue;
    }

    const nextLine = findNextNonEmptyLine(lines, index + 1);
    const followingLine = findNextNonEmptyLine(lines, index + 2);
    const previousLine = currentBlock[currentBlock.length - 1] ?? "";
    const lineLooksLikeContinuation = looksLikeBulletContinuationLine(
      line,
      previousLine,
    );
    const lineStartsNewEntry =
      currentBlock.length > 0 &&
      !lineLooksLikeContinuation &&
      isLikelyExperienceHeader(line, nextLine, followingLine) &&
      (
        currentBlockHasNarrative ||
        encounteredGap ||
        blockHasExperienceMetadata(currentBlock) ||
        currentBlock.length >= 3
      );

    if (lineStartsNewEntry) {
      blocks.push(currentBlock);
      currentBlock = [line];
      currentBlockHasNarrative = false;
      encounteredGap = false;
      continue;
    }

    currentBlock.push(line);
    encounteredGap = false;

    if (
      isExplicitBulletLine(line) ||
      (!isLikelyExperienceHeader(line, nextLine, followingLine) &&
        looksLikeDescriptionLine(cleanBullet(line)))
    ) {
      currentBlockHasNarrative = true;
    }
  }

  if (currentBlock.length) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function looksLikeBulletContinuationLine(currentLine: string, previousLine: string) {
  const cleanedCurrentLine = normalizeInlineSpaces(cleanBullet(currentLine));
  const cleanedPreviousLine = normalizeInlineSpaces(cleanBullet(previousLine));

  if (!cleanedCurrentLine || !cleanedPreviousLine) {
    return false;
  }

  if (isExplicitBulletLine(currentLine)) {
    return false;
  }

  if (looksLikeDateLine(cleanedCurrentLine) || looksLikeLocationLine(cleanedCurrentLine)) {
    return false;
  }

  return (
    !/[.!?]$/.test(cleanedPreviousLine) ||
    /^[a-z(]/.test(cleanedCurrentLine) ||
    BULLET_CONTINUATION_PATTERN.test(cleanedCurrentLine) ||
    looksLikeDescriptionLine(cleanedCurrentLine)
  );
}

function combineWrappedText(previous: string, current: string) {
  if (previous.endsWith("-")) {
    return `${previous}${current}`.replace(/\s+/g, " ").trim();
  }

  return `${previous} ${current}`.replace(/\s+/g, " ").trim();
}

function extractExperienceBullets(lines: string[]) {
  const bullets: string[] = [];

  for (const line of lines) {
    const cleanedLine = normalizeInlineSpaces(cleanBullet(line));

    if (!cleanedLine) {
      continue;
    }

    if (looksLikeDateLine(cleanedLine) || looksLikeLocationLine(cleanedLine)) {
      continue;
    }

    if (!bullets.length) {
      bullets.push(cleanedLine);
      continue;
    }

    const previousBullet = bullets[bullets.length - 1] ?? "";
    const shouldAppendToPrevious = looksLikeBulletContinuationLine(
      cleanedLine,
      previousBullet,
    );

    if (shouldAppendToPrevious) {
      bullets[bullets.length - 1] = combineWrappedText(previousBullet, cleanedLine);
      continue;
    }

    bullets.push(cleanedLine);
  }

  return bullets.filter((bullet) => bullet.length > 8).slice(0, 8);
}

function splitTitleAndCompany(primaryHeaderLine: string, fallbackCompanyLine: string) {
  const normalizedHeader = normalizeInlineSpaces(primaryHeaderLine);
  const separatorPatterns = [/\s+at\s+/i, /\s+\|\s+/, /\s+[–—]\s+/, /\s+-\s+/];

  for (const pattern of separatorPatterns) {
    const parts = normalizedHeader
      .split(pattern)
      .map((entry) => normalizeInlineSpaces(entry))
      .filter(Boolean);

    if (parts.length !== 2) {
      continue;
    }

    const [title, company] = parts;

    if (
      company &&
      !looksLikeDateLine(company) &&
      !looksLikeLocationLine(company) &&
      !looksLikeDescriptionLine(company)
    ) {
      return {
        title,
        company,
      };
    }
  }

  const commaParts = normalizedHeader
    .split(",")
    .map((entry) => normalizeInlineSpaces(entry))
    .filter(Boolean);

  if (commaParts.length >= 2) {
    const companyCandidate = commaParts[commaParts.length - 1] ?? "";

    if (
      companyCandidate &&
      !looksLikeDateLine(companyCandidate) &&
      !looksLikeLocationLine(companyCandidate) &&
      companyCandidate.split(/\s+/).length <= 8
    ) {
      return {
        title: commaParts.slice(0, -1).join(", "),
        company: companyCandidate,
      };
    }
  }

  if (
    fallbackCompanyLine &&
    !looksLikeDateLine(fallbackCompanyLine) &&
    !looksLikeLocationLine(fallbackCompanyLine) &&
    !looksLikeDescriptionLine(fallbackCompanyLine)
  ) {
    return {
      title: normalizedHeader,
      company: normalizeInlineSpaces(fallbackCompanyLine),
    };
  }

  return {
    title: normalizedHeader,
    company: "",
  };
}

function parseExperienceBlock(block: string[]) {
  const headerLines: string[] = [];
  const bodyLines: string[] = [];
  let bodyStarted = false;

  for (const line of block) {
    const normalizedLine = normalizeInlineSpaces(line);

    if (!normalizedLine) {
      continue;
    }

    if (bodyStarted) {
      bodyLines.push(normalizedLine);
      continue;
    }

    if (isExplicitBulletLine(normalizedLine)) {
      bodyStarted = true;
      bodyLines.push(normalizedLine);
      continue;
    }

    const isMetadataLine =
      looksLikeDateLine(normalizedLine) || looksLikeLocationLine(normalizedLine);
    const canStayInHeader =
      isMetadataLine ||
      !headerLines.length ||
      (headerLines.length < 3 &&
        !looksLikeDescriptionLine(normalizedLine) &&
        !looksLikeBulletContinuationLine(
          normalizedLine,
          headerLines[headerLines.length - 1] ?? "",
        ));

    if (canStayInHeader) {
      headerLines.push(normalizedLine);
      continue;
    }

    bodyStarted = true;
    bodyLines.push(normalizedLine);
  }

  if (!headerLines.length && !bodyLines.length) {
    return null;
  }

  const cleanedHeaderLines = headerLines
    .map((line) => stripDateRange(cleanBullet(line)))
    .map((line) => normalizeInlineSpaces(line))
    .filter(Boolean);
  const location =
    cleanedHeaderLines.find((line) => looksLikeLocationLine(line)) ?? "";
  const headerFragments = cleanedHeaderLines.filter((line) => line !== location);
  const primaryHeaderLine = headerFragments[0] ?? "";
  const fallbackCompanyLine = headerFragments[1] ?? "";
  const { title, company } = splitTitleAndCompany(
    primaryHeaderLine,
    fallbackCompanyLine,
  );
  const { startDate, endDate } = parseDateRange(headerLines.join(" "));
  const description = extractExperienceBullets(bodyLines);

  if (!title && !company && !location && !description.length) {
    return null;
  }

  return {
    title,
    company,
    location,
    startDate,
    endDate,
    description,
  };
}

function parseExperience(sectionText: string) {
  if (!sectionText) {
    return [];
  }

  return splitExperienceIntoBlocks(sectionText)
    .map((block) => parseExperienceBlock(block))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter(
      (entry) =>
        entry.title ||
        entry.company ||
        entry.location ||
        entry.description.length > 0,
    )
    .slice(0, 8);
}

function hasEducationInstitution(text: string) {
  return EDUCATION_INSTITUTION_PATTERN.test(text);
}

function hasDegreeKeyword(text: string) {
  return DEGREE_KEYWORD_PATTERN.test(text);
}

function extractEducationYear(text: string) {
  return text.match(EDUCATION_YEAR_PATTERN)?.[0]?.trim() ?? "";
}

function stripEducationYear(text: string) {
  return normalizeInlineSpaces(text.replace(EDUCATION_YEAR_PATTERN, " "));
}

function splitEducationIntoBlocks(sectionText: string) {
  const lines = sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line || !isNoiseLine(line));
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let currentHasDegree = false;
  let currentHasInstitution = false;
  let currentHasYear = false;
  let encounteredGap = false;

  const pushCurrentBlock = () => {
    if (!currentBlock.length) {
      return;
    }

    blocks.push(currentBlock);
    currentBlock = [];
    currentHasDegree = false;
    currentHasInstitution = false;
    currentHasYear = false;
  };

  for (const line of lines) {
    if (!line) {
      encounteredGap = currentBlock.length > 0;
      continue;
    }

    const cleanedLine = normalizeInlineSpaces(cleanBullet(line));

    if (!cleanedLine) {
      continue;
    }

    const lineHasDegree = hasDegreeKeyword(cleanedLine);
    const lineHasInstitution = hasEducationInstitution(cleanedLine);
    const lineHasYear = Boolean(extractEducationYear(cleanedLine));
    const startsNewBlock =
      currentBlock.length > 0 &&
      (
        isExplicitBulletLine(line) ||
        (encounteredGap && (lineHasDegree || lineHasInstitution || lineHasYear)) ||
        ((lineHasDegree || lineHasInstitution) &&
          (currentHasYear || (currentHasDegree && currentHasInstitution))) ||
        (lineHasYear && currentHasYear && (currentHasDegree || currentHasInstitution))
      );

    if (startsNewBlock) {
      pushCurrentBlock();
    }

    currentBlock.push(cleanedLine);
    currentHasDegree = currentHasDegree || lineHasDegree;
    currentHasInstitution = currentHasInstitution || lineHasInstitution;
    currentHasYear = currentHasYear || lineHasYear;
    encounteredGap = false;
  }

  pushCurrentBlock();

  return blocks;
}

function parseEducationSingleLine(line: string) {
  const segments = line
    .split(/[|,]/)
    .map((entry) => normalizeInlineSpaces(entry))
    .filter(Boolean);
  const institution = segments.find((segment) => hasEducationInstitution(segment)) ?? "";
  const degree = segments.find(
    (segment) => segment !== institution && hasDegreeKeyword(segment),
  ) ?? "";

  return {
    degree: degree || stripEducationYear(institution ? line.replace(institution, "") : line),
    institution,
  };
}

function parseEducationBlock(block: string[]) {
  const lines = block
    .map((line) => normalizeInlineSpaces(cleanBullet(line)))
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const year = lines.map((line) => extractEducationYear(line)).find(Boolean) ?? "";
  const strippedLines = lines.map((line) => stripEducationYear(line)).filter(Boolean);

  if (!strippedLines.length) {
    return year ? { degree: "", institution: "", year } : null;
  }

  let institution =
    strippedLines.find((line) => hasEducationInstitution(line)) ?? "";
  let degree =
    strippedLines.find((line) => line !== institution && hasDegreeKeyword(line)) ?? "";
  const locationLine =
    strippedLines.find((line) => line !== institution && looksLikeLocationLine(line)) ?? "";

  if (strippedLines.length === 1) {
    const singleLineEntry = parseEducationSingleLine(strippedLines[0] ?? "");
    institution = institution || singleLineEntry.institution;
    degree = degree || singleLineEntry.degree;
  }

  if (!institution && strippedLines.length >= 2 && degree === strippedLines[0]) {
    institution = strippedLines[1] ?? "";
  }

  if (!degree) {
    degree = strippedLines.find((line) => line !== institution) ?? "";
  }

  if (!institution && strippedLines.length >= 2) {
    institution =
      strippedLines.find((line) => line !== degree && !hasDegreeKeyword(line)) ??
      strippedLines[1] ??
      "";
  }

  if (institution && locationLine && !institution.includes(locationLine)) {
    institution = `${institution} · ${locationLine}`;
  }

  if (!degree && !institution && !year) {
    return null;
  }

  return {
    degree,
    institution,
    year,
  };
}

function parseEducation(sectionText: string) {
  if (!sectionText) {
    return [];
  }

  return splitEducationIntoBlocks(sectionText)
    .map((block) => parseEducationBlock(block))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => entry.degree || entry.institution || entry.year)
    .slice(0, 6);
}

function inferSummary(rawText: string) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim());
  const firstSectionIndex = findFirstSectionIndex(rawText);
  const headerBoundary = firstSectionIndex >= 0 ? firstSectionIndex : Math.min(lines.length, 12);
  const headerLines = lines
    .slice(0, headerBoundary)
    .filter(Boolean);
  const introCandidates = headerLines
    .filter((line) => !isLikelyHeading(line))
    .filter((line) => !line.includes("@"))
    .filter((line) => !/\+?\d[\d\s().-]{6,}/.test(line))
    .filter((line) => !/(?:https?:\/\/|www\.|linkedin\.com|github\.com|gitlab\.com|bitbucket\.org)/i.test(line))
    .filter((line) => !ROLE_KEYWORD_PATTERN.test(line))
    .filter((line) => line.length > 60)
    .filter((line) => !looksLikeSkillSourceLine(line))
    .filter((line) => !looksLikeLocationLine(line));

  return normalizeWhitespace(introCandidates.join(" "));
}

function cleanSummaryCandidate(summaryText: string) {
  const lines: string[] = [];

  for (const rawLine of summaryText.split("\n")) {
    const line = rawLine.trim();

    if (!line || isNoiseLine(line)) {
      continue;
    }

    if (matchResumeSectionHeading(line)) {
      break;
    }

    if (isExplicitBulletLine(line)) {
      break;
    }

    lines.push(line);
  }

  const cleaned = normalizeWhitespace(lines.join(" "));
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;

  if (wordCount < 8 || cleaned.includes("@") || /\+?\d[\d\s().-]{6,}/.test(cleaned)) {
    return "";
  }

  return cleaned;
}

export function extractLocalSummaryCandidate(rawText: string) {
  const normalizedText = preprocessResumeText(rawText);
  const sections = splitResumeIntoSections(normalizedText);
  return cleanSummaryCandidate(sections.summary) || inferSummary(normalizedText);
}

function calculateReadabilityScore(rawText: string) {
  const sentences = rawText
    .split(/[.!?]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences.length) {
    return 0;
  }

  const words = rawText
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const averageSentenceLength = words.length / sentences.length;

  if (averageSentenceLength <= 12) {
    return 88;
  }

  if (averageSentenceLength <= 18) {
    return 80;
  }

  if (averageSentenceLength <= 24) {
    return 72;
  }

  if (averageSentenceLength <= 30) {
    return 62;
  }

  return 52;
}

export async function extractDocumentTextFromFile(file: File) {
  const extension = getFileExtension(file.name);

  if (!SUPPORTED_RESUME_EXTENSIONS.has(extension)) {
    throw new Error("Only PDF, DOCX, and TXT files are supported.");
  }

  const arrayBuffer = await file.arrayBuffer();

  if (extension === ".txt") {
    return normalizeWhitespace(Buffer.from(arrayBuffer).toString("utf8"));
  }

  if (extension === ".pdf") {
    await ensurePdfWorkerConfigured();
    const { PDFParse } = await getPdfParseModule();

    const parser = new PDFParse({
      data: new Uint8Array(arrayBuffer),
    });

    try {
      const result = await parser.getText();

      return normalizeWhitespace(result.text);
    } finally {
      await parser.destroy();
    }
  }

  const mammoth = getMammothModule();
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(arrayBuffer),
  });

  return normalizeWhitespace(result.value);
}

export async function extractResumeTextFromFile(file: File) {
  return extractDocumentTextFromFile(file);
}

export function parseResumeFallback(rawText: string): ParsedResumeData {
  const pipeline = parseWithValidation(rawText);
  const normalizedText = pipeline.preprocessedText;
  const sections = splitResumeIntoSections(normalizedText);
  const parsedData = pipeline.parsedData;

  parsedData.personalInfo.name = extractName(normalizedText);
  parsedData.personalInfo.title = extractTitle(
    normalizedText,
    parsedData.personalInfo.name,
  );
  parsedData.personalInfo.email =
    normalizedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  parsedData.personalInfo.phone = extractPhone(normalizedText);
  parsedData.personalInfo.location = extractLocation(normalizedText);
  parsedData.personalInfo.links = extractProfileLinksFromText(normalizedText);
  parsedData.summary = cleanSummaryCandidate(sections.summary) || inferSummary(normalizedText);
  parsedData.skills =
    parsedData.skills.length > 0
      ? parsedData.skills
      : extractSkills(sections.skills, normalizedText);
  parsedData.experience =
    parsedData.experience.length > 0
      ? parsedData.experience
      : parseExperience(sections.experience);
  parsedData.education =
    parsedData.education.length > 0
      ? parsedData.education
      : parseEducation(sections.education);

  return parsedData;
}

export function extractLocalResumeSectionCandidates(
  rawText: string,
): LocalResumeSectionCandidates {
  const pipeline = parseWithValidation(rawText);
  const normalizedText = pipeline.preprocessedText;
  const sections = splitResumeIntoSections(normalizedText);

  return {
    normalizedText,
    headerText: extractHeaderText(normalizedText),
    sections,
    parsedData: parseResumeFallback(normalizedText),
  };
}

export function extractResumeStructureContext(rawText: string): {
  normalizedText: string;
  headerText: string;
  sections: ResumeSectionTextMap;
} {
  const normalizedText = preprocessResumeText(rawText);
  const sections = splitResumeIntoSections(normalizedText);
  const inferredSummary = cleanSummaryCandidate(sections.summary) || inferSummary(normalizedText);

  return {
    normalizedText,
    headerText: extractHeaderText(normalizedText),
    sections: {
      ...sections,
      summary: inferredSummary,
    },
  };
}

export function extractLocalSkillsCandidate(rawText: string) {
  const { normalizedText, sections } = extractResumeStructureContext(rawText);
  return extractSkills(sections.skills, normalizedText);
}

export function assessResumeParseConfidence(
  parsedData: ParsedResumeData,
): {
  score: number;
  isConfident: boolean;
  reasons: string[];
} {
  const hasName = Boolean(parsedData.personalInfo.name);
  const hasTitle = Boolean(parsedData.personalInfo.title);
  const hasContact = Boolean(
    parsedData.personalInfo.email || parsedData.personalInfo.phone,
  );
  const hasSummary = parsedData.summary.length >= 45;
  const hasSkills = parsedData.skills.length >= 4;
  const meaningfulExperience = parsedData.experience.filter((entry) => {
    const headerSignalCount = [
      entry.title,
      entry.company,
      entry.startDate,
      entry.endDate,
      entry.location,
    ].filter(Boolean).length;

    return headerSignalCount >= 2 || entry.description.length >= 2;
  });
  const experienceBulletCount = parsedData.experience.reduce(
    (total, entry) => total + entry.description.length,
    0,
  );
  const datedExperienceCount = parsedData.experience.filter(
    (entry) => entry.startDate || entry.endDate,
  ).length;
  const hasExperience = meaningfulExperience.length > 0;
  const hasEducation = parsedData.education.some(
    (entry) => entry.degree || entry.institution || entry.year,
  );
  const hasSupportingSection = hasSkills || hasSummary || hasEducation;
  const hasStrongExperienceSignal =
    meaningfulExperience.length >= 2 ||
    experienceBulletCount >= 4 ||
    datedExperienceCount >= 2;

  const score = Math.min(
    100,
    Math.round(
      (hasName ? 8 : 0) +
        (hasTitle ? 6 : 0) +
        (hasContact ? 12 : 0) +
        (parsedData.personalInfo.location ? 4 : 0) +
        (hasSummary ? 12 : parsedData.summary.length >= 25 ? 6 : 0) +
        (parsedData.skills.length >= 8
          ? 18
          : parsedData.skills.length >= 5
            ? 14
            : parsedData.skills.length >= 3
              ? 9
              : 0) +
        (hasExperience ? 16 : 0) +
        Math.min(meaningfulExperience.length, 3) * 5 +
        Math.min(experienceBulletCount, 6) +
        Math.min(datedExperienceCount, 2) * 3 +
        (hasEducation ? 12 : 0),
    ),
  );
  const reasons: string[] = [];

  if (!hasContact) {
    reasons.push("missing contact info");
  }

  if (!hasTitle) {
    reasons.push("missing header title");
  }

  if (!hasExperience) {
    reasons.push("missing reliable experience");
  }

  if (!hasSupportingSection) {
    reasons.push("missing supporting sections");
  }

  if (score < LOCAL_PARSE_CONFIDENCE_THRESHOLD) {
    reasons.push("low parser confidence");
  }

  return {
    score,
    isConfident:
      score >= LOCAL_PARSE_CONFIDENCE_THRESHOLD &&
      hasName &&
      hasContact &&
      (hasExperience || hasStrongExperienceSignal) &&
      hasSupportingSection,
    reasons,
  };
}

export function analyzeResumeFallback(
  parsedData: ParsedResumeData,
  rawText: string,
): ResumeAnalysisReport {
  const text = rawText.toLowerCase();
  const sectionCompleteness = {
    personalInfo: Boolean(
      parsedData.personalInfo.name ||
        parsedData.personalInfo.email ||
        parsedData.personalInfo.phone,
    ),
    summary: Boolean(parsedData.summary),
    skills: parsedData.skills.length > 0,
    experience: parsedData.experience.length > 0,
    education: parsedData.education.length > 0,
  };

  const completedSectionCount = Object.values(sectionCompleteness).filter(Boolean).length;
  const includesMetrics = /\b\d+[%+x]?\b/.test(rawText);
  const bulletCount = parsedData.experience.reduce(
    (total, entry) => total + entry.description.length,
    0,
  );
  const scorePenalty =
    (parsedData.skills.length < 6 ? 4 : 0) +
    (bulletCount < 4 ? 8 : 0) +
    (!includesMetrics ? 4 : 0);

  const score = Math.max(
    18,
    Math.min(
      100,
      20 +
        completedSectionCount * 10 +
        Math.min(parsedData.skills.length, 8) * 1.5 +
        Math.min(parsedData.experience.length, 4) * 5 +
        Math.min(parsedData.education.length, 2) * 3 +
        (parsedData.summary.length > 80 ? 5 : 0) +
        (includesMetrics ? 6 : 0) -
        scorePenalty,
    ),
  );

  const tips: string[] = [];

  if (!sectionCompleteness.summary) {
    tips.push("Add a short summary at the top so recruiters quickly understand your strengths.");
  }

  if (!sectionCompleteness.skills || parsedData.skills.length < 6) {
    tips.push("Add the main tools and skills you want recruiters to notice first.");
  }

  if (!includesMetrics) {
    tips.push("Add a few numbers to your work bullets, like speed, scale, savings, or growth.");
  }

  if (bulletCount < 4) {
    tips.push("Give recent jobs a few more bullets that explain what you owned and what improved.");
  }

  if (!sectionCompleteness.education) {
    tips.push("Add education or certificates if they help support the role you want.");
  }

  if (!tips.length) {
    tips.push("Match the summary and skills to the words used in the jobs you are applying for.");
    tips.push("Start each work bullet with a clear action and end with the result when you can.");
  }

  const missingKeywords = COMMON_RESUME_KEYWORDS.filter(
    (keyword) => !text.includes(keyword),
  ).slice(0, 6);

  return {
    score: Math.round(score),
    missingKeywords,
    tips: tips.slice(0, 6),
    sectionCompleteness,
    readabilityScore: calculateReadabilityScore(rawText),
  };
}

export function auditResumeExtraction(
  parsedData: ParsedResumeData,
  rawText: string,
): ResumeExtractionAudit {
  return {
    personalInfo: auditProfileExtraction(parsedData, rawText),
    summary: auditSummaryExtraction(parsedData, rawText),
    skills: auditSkillsExtraction(parsedData, rawText),
    experience: auditExperienceExtraction(parsedData, rawText),
    education: auditEducationExtraction(parsedData, rawText),
  };
}

function auditProfileExtraction(
  parsedData: ParsedResumeData,
  rawText: string,
) {
  const issues: string[] = [];
  const normalizedText = normalizeWhitespace(rawText);
  const extractedName = extractName(normalizedText);
  const extractedTitle = extractTitle(normalizedText, extractedName);
  const extractedLocation = extractLocation(normalizedText);
  const extractedPhone = extractPhone(normalizedText);
  const extractedLinks = extractProfileLinksFromText(normalizedText);

  if (extractedName && !parsedData.personalInfo.name) {
    issues.push("Candidate name appears to be missing.");
  }
  if (extractedTitle && !parsedData.personalInfo.title) {
    issues.push("Header title/headline appears to be missing.");
  }
  if (extractedLocation && !parsedData.personalInfo.location) {
    issues.push("Header location appears to be missing.");
  }
  if (extractedPhone && !parsedData.personalInfo.phone) {
    issues.push("Phone number appears to be missing.");
  }
  if (
    extractedLinks.length > 0 &&
    parsedData.personalInfo.links.length < extractedLinks.length
  ) {
    issues.push("Some visible profile links appear to be missing.");
  }

  return issues;
}

function auditSummaryExtraction(
  parsedData: ParsedResumeData,
  rawText: string,
) {
  const issues: string[] = [];
  const structure = extractResumeStructureContext(rawText);
  const inferredSummary = structure.sections.summary || inferSummary(structure.normalizedText);

  if (inferredSummary && !parsedData.summary) {
    issues.push("Visible summary/profile block appears to be missing.");
  }

  if (
    inferredSummary &&
    parsedData.summary &&
    parsedData.summary.length + 40 < inferredSummary.length
  ) {
    issues.push("Summary appears shorter than the visible source block.");
  }

  return issues;
}

function auditSkillsExtraction(
  parsedData: ParsedResumeData,
  rawText: string,
) {
  const issues: string[] = [];
  const localSkills = extractLocalSkillsCandidate(rawText);
  const localGroupedCount = localSkills.filter((skill) => skill.includes(":")).length;

  if (localSkills.length > 0 && parsedData.skills.length === 0) {
    issues.push("Visible skills appear to be missing.");
  }
  if (localSkills.length >= 6 && parsedData.skills.length + 2 < localSkills.length) {
    issues.push("Some visible skills may have been dropped.");
  }
  if (localGroupedCount > 0 && !parsedData.skills.some((skill) => skill.includes(":"))) {
    issues.push("Grouped skill categories appear to have been flattened or lost.");
  }

  return issues;
}

function auditExperienceExtraction(
  parsedData: ParsedResumeData,
  rawText: string,
) {
  const issues: string[] = [];
  const structure = extractResumeStructureContext(rawText);
  const experienceText = structure.sections.experience;
  const visibleRoleSignals = (experienceText.match(/\b(engineer|developer|manager|analyst|designer|architect|lead|consultant|intern|specialist)\b/gi) ?? []).length;
  const dateSignals = (experienceText.match(new RegExp(DATE_RANGE_PATTERN, "gi")) ?? []).length;
  const rawBulletSignals = experienceText
    .split("\n")
    .filter((line) => EXPLICIT_BULLET_PATTERN.test(line)).length;
  const parsedBulletCount = parsedData.experience.reduce((total, entry) => total + entry.description.length, 0);

  if ((visibleRoleSignals > 0 || dateSignals > 0) && parsedData.experience.length === 0) {
    issues.push("Visible work experience appears to be missing.");
  }
  if (
    visibleRoleSignals >= 2 &&
    parsedData.experience.length < 2
  ) {
    issues.push("Some work experience entries may be missing.");
  }
  if (rawBulletSignals >= 4 && parsedBulletCount + 1 < rawBulletSignals) {
    issues.push("Some experience bullets may have been dropped or fragmented.");
  }

  return issues;
}

function auditEducationExtraction(
  parsedData: ParsedResumeData,
  rawText: string,
) {
  const issues: string[] = [];
  const structure = extractResumeStructureContext(rawText);
  const educationText = structure.sections.education;
  const degreeSignals = (educationText.match(DEGREE_KEYWORD_PATTERN) ?? []).length;
  const institutionSignals = (educationText.match(EDUCATION_INSTITUTION_PATTERN) ?? []).length;

  if ((degreeSignals > 0 || institutionSignals > 0) && parsedData.education.length === 0) {
    issues.push("Visible education entries appear to be missing.");
  }
  if (
    degreeSignals >= 2 &&
    parsedData.education.length < 2
  ) {
    issues.push("Some education entries may be missing.");
  }

  return issues;
}
