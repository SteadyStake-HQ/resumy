import { formatResumeLocation } from "@/lib/location";
import {
  createEmptyParsedResumeData,
  type ParsedResumeData,
  type ResumeEducation,
  type ResumeExperience,
} from "@/lib/resume";

export type GroupedSkillSet = {
  category: string;
  items: string[];
};

export type ParsedResume = {
  work_experience: Array<{
    job_title: string;
    company_name: string;
    location: string;
    start_date: string;
    end_date: string;
    responsibilities: string[];
  }>;
  education: Array<{
    degree: string;
    field_of_study: string;
    institution_name: string;
    location: string;
    start_date: string;
    end_date: string;
    grade: string;
  }>;
  skills: {
    grouped_skills: GroupedSkillSet[];
  };
};

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
};

export type ParseWithValidationResult = {
  preprocessedText: string;
  parsed: ParsedResume;
  parsedData: ParsedResumeData;
  validation: ValidationResult;
};

type SplitSectionsResult = {
  skills: string;
  workExperience: string;
  education: string;
};

type ParseOptions = {
  aggressive?: boolean;
};

const MONTH_PATTERN =
  "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)";
const DATE_TOKEN_PATTERN = `${MONTH_PATTERN}\\s+\\d{4}|\\d{4}`;
const DATE_RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN_PATTERN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN_PATTERN}|Present|Current|Now)`,
  "i",
);
const INLINE_ROLE_WITH_DATE_PATTERN = new RegExp(
  `^(.+?)\\s+(${DATE_TOKEN_PATTERN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN_PATTERN}|Present|Current|Now)\\s*$`,
  "i",
);
const BULLET_PREFIX_PATTERN = /^\s*(?:[•*·▪◦●▸–-]|\d+[.)])\s+/;
const SPACED_HEADER_PATTERN = /^(?:[A-Z]\s+){3,}[A-Z](?:\s+[A-Z])*$/;
const FIELD_OF_STUDY_PATTERN = /\b(?:in|of)\s+(.+)$/i;
const DEGREE_START_PATTERN =
  /\b(?:bachelor|master|mba|ph\.?d|doctor|associate|b\.?sc|m\.?sc|beng|meng|diploma)\b/i;
const DEGREE_SIGNAL_PATTERN =
  /\b(?:bachelor|master|mba|ph\.?d|doctor|associate|b\.?sc|m\.?sc|bs\b|ba\b|ms\b|ma\b|beng|meng|diploma|university|college)\b/i;
const INSTITUTION_SIGNAL_PATTERN =
  /\b(?:university|college|school|institute|academy|polytechnic|faculty)\b/i;
const EXPERIENCE_ROLE_SIGNAL_PATTERN =
  /\b(?:engineer|developer|manager|analyst|designer|architect|consultant|intern|lead|specialist|administrator|founder|director|owner|scientist)\b/i;
const SECTION_HEADER_MAP = new Map<string, string>([
  ["ABOUTME", "ABOUT ME"],
  ["ABOUT", "ABOUT"],
  ["PROFILE", "PROFILE"],
  ["SUMMARY", "SUMMARY"],
  ["PROFESSIONALSUMMARY", "PROFESSIONAL SUMMARY"],
  ["OBJECTIVE", "OBJECTIVE"],
  ["TECHSTACKSKILLS", "SKILLS"],
  ["TECHSTACKANDSKILLS", "SKILLS"],
  ["TECHNICALSKILLS", "SKILLS"],
  ["SKILLS", "SKILLS"],
  ["CORECOMPETENCIES", "SKILLS"],
  ["WORKEXPERIENCE", "WORK EXPERIENCE"],
  ["EXPERIENCE", "WORK EXPERIENCE"],
  ["PROFESSIONALEXPERIENCE", "WORK EXPERIENCE"],
  ["EDUCATION", "EDUCATION"],
  ["ACADEMICBACKGROUND", "EDUCATION"],
]);
const SKILL_CATEGORY_NAMES = [
  "Languages",
  "Backend",
  "Backend & APIs",
  "Frontend",
  "Architecture",
  "Blockchain",
  "Blockchain & Web3",
  "AI & Data",
  "AI & ML",
  "AI / ML",
  "AI/ML",
  "Databases",
  "Database",
  "Data Eng.",
  "Data Engineering",
  "Cloud & DevOps",
  "DevOps / Cloud",
  "DevOps & Infra",
  "DevOps & Cloud",
  "CI/CD & Tooling",
  "Monitoring",
  "Testing",
  "Methodologies",
  "Observability",
  "Security",
  "Tools & Practices",
  "Tools & Technologies",
  "Tools and Technologies",
];
const COMPACT_ROLE_WORDS = [
  "Principal",
  "Senior",
  "Staff",
  "Lead",
  "Junior",
  "Full",
  "Stack",
  "Frontend",
  "Backend",
  "Front",
  "End",
  "Back",
  "Software",
  "Engineer",
  "Developer",
  "Architect",
  "Manager",
  "Analyst",
  "Designer",
  "Consultant",
  "Specialist",
];

function collapseLetterSpacedWords(value: string) {
  return value
    .replace(
      /(?:^|(?<=[\s|•·:]))(?:[A-Za-z]\s+){2,}[A-Za-z](?=$|[\s|•·:])/g,
      (match) => match.replace(/\s+/g, ""),
    )
    .replace(/\s+([&/])\s+/g, " $1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function segmentCompactRoleTitle(value: string) {
  if (value.includes(" ") || !/^[A-Za-z]{10,}$/.test(value)) {
    return value;
  }

  const words: string[] = [];
  let remaining = value;

  while (remaining) {
    const nextWord = COMPACT_ROLE_WORDS.find((word) =>
      remaining.toLowerCase().startsWith(word.toLowerCase()),
    );

    if (!nextWord) {
      return value;
    }

    words.push(nextWord);
    remaining = remaining.slice(nextWord.length);
  }

  return words.length >= 2 ? words.join(" ") : value;
}

function normalizeInlineSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDocumentWhitespace(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeNoiseLine(line: string) {
  return (
    /^-*\s*\d+\s+of\s+\d+\s*-*$/i.test(line) ||
    /^page\s+\d+$/i.test(line) ||
    /^page\s+\d+\s+of\s+\d+$/i.test(line)
  );
}

function collapseSpacedHeader(line: string) {
  const trimmedLine = line.trim();

  if (!SPACED_HEADER_PATTERN.test(trimmedLine)) {
    return trimmedLine;
  }

  const collapsed = trimmedLine.replace(/\s+/g, "");

  return SECTION_HEADER_MAP.get(collapsed) ?? collapsed;
}

function normalizeHeaderLine(line: string) {
  const collapsed = collapseLetterSpacedWords(collapseSpacedHeader(line));
  const compact = collapsed
    .replace(/&/g, "AND")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

  return SECTION_HEADER_MAP.get(compact) ?? segmentCompactRoleTitle(collapsed);
}

function repairInlineSkillCategoryCollisions(line: string) {
  if (!line.includes(":")) {
    return line;
  }

  if (DATE_RANGE_PATTERN.test(line)) {
    return line;
  }

  let repaired = line;
  let lastValue = "";

  while (repaired !== lastValue) {
    lastValue = repaired;
    for (const categoryName of SKILL_CATEGORY_NAMES) {
      const escapedCategory = categoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      repaired = repaired.replace(
        new RegExp(`\\s+(${escapedCategory})(?::|\\s)`, "g"),
        (match, category, offset, source) => {
          const prefix = source.slice(0, offset).trimEnd();

          if (!prefix || prefix.endsWith("\n")) {
            return match;
          }

          return `\n${category}${match.trimEnd().endsWith(":") ? ":" : " "}`;
        },
      );
    }
  }

  return repaired;
}

function expandInlineSectionStarts(line: string) {
  const sectionMatch = line.match(/^(WORK EXPERIENCE|EDUCATION|SKILLS)\s+(.+)$/i);

  if (!sectionMatch) {
    return line;
  }

  const heading = normalizeHeaderLine(sectionMatch[1] ?? "");
  const remainder = (sectionMatch[2] ?? "").trim();

  return remainder ? `${heading}\n${remainder}` : heading;
}

function looksLikeSkillCategoryLine(line: string) {
  const trimmedLine = line.trim();

  if (!trimmedLine) {
    return false;
  }

  if (/^[^:]{1,64}:\s+/.test(trimmedLine)) {
    return true;
  }

  return SKILL_CATEGORY_NAMES.some((category) =>
    new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i").test(trimmedLine),
  );
}

function shouldMergeContinuation(previous: string, current: string) {
  if (!previous || !current) {
    return false;
  }

  if (
    looksLikeSectionHeading(previous) ||
    looksLikeSectionHeading(current) ||
    looksLikeSkillCategoryLine(previous) ||
    looksLikeSkillCategoryLine(current) ||
    looksLikeRoleStart(current, "", true)
  ) {
    return false;
  }

  if (DATE_RANGE_PATTERN.test(previous) || DEGREE_SIGNAL_PATTERN.test(previous)) {
    return false;
  }

  if (BULLET_PREFIX_PATTERN.test(current)) {
    return false;
  }

  if (BULLET_PREFIX_PATTERN.test(previous)) {
    return true;
  }

  return (
    /[-,(/]$/.test(previous) ||
    /^[a-z0-9(]/.test(current) ||
    (!/[.!?:]$/.test(previous) && current.split(/\s+/).length <= 12)
  );
}

function mergeWrappedLines(lines: string[]) {
  const merged: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      merged.push("");
      continue;
    }

    if (!merged.length) {
      merged.push(line);
      continue;
    }

    const previous = merged[merged.length - 1] ?? "";

    if (shouldMergeContinuation(previous, line)) {
      merged[merged.length - 1] = normalizeInlineSpaces(`${previous} ${line}`);
      continue;
    }

    merged.push(line);
  }

  return merged;
}

export function preprocessResumeText(rawText: string): string {
  // Step 0: normalize OCR-style spacing, inline category collisions, and wrapped lines.
  const normalizedText = normalizeDocumentWhitespace(rawText);
  const normalizedLines = normalizedText
    .split("\n")
    .map((line) => normalizeHeaderLine(line))
    .map((line) => repairInlineSkillCategoryCollisions(line))
    .map((line) => expandInlineSectionStarts(line))
    .join("\n")
    .split("\n")
    .map((line) => normalizeInlineSpaces(line))
    .filter((line, index, allLines) => !(looksLikeNoiseLine(line) && allLines[index - 1] === line));

  return normalizeDocumentWhitespace(mergeWrappedLines(normalizedLines).join("\n"));
}

function normalizeSectionHeadingKey(line: string) {
  return line
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .trim();
}

function looksLikeSectionHeading(line: string) {
  const key = normalizeSectionHeadingKey(line);
  return (
    key === "SKILLS" ||
    key === "TECHNICALSKILLS" ||
    key === "CORECOMPETENCIES" ||
    key === "WORKEXPERIENCE" ||
    key === "EXPERIENCE" ||
    key === "PROFESSIONALEXPERIENCE" ||
    key === "EDUCATION" ||
    key === "ACADEMICBACKGROUND"
  );
}

function classifySectionHeading(line: string): keyof SplitSectionsResult | null {
  const key = normalizeSectionHeadingKey(line);

  if (key === "SKILLS" || key === "TECHNICALSKILLS" || key === "CORECOMPETENCIES") {
    return "skills";
  }

  if (key === "WORKEXPERIENCE" || key === "EXPERIENCE" || key === "PROFESSIONALEXPERIENCE") {
    return "workExperience";
  }

  if (key === "EDUCATION" || key === "ACADEMICBACKGROUND") {
    return "education";
  }

  return null;
}

export function splitSections(text: string): SplitSectionsResult {
  // Step 1: isolate the core parser-owned sections so they do not bleed into each other.
  const sections: Record<keyof SplitSectionsResult, string[]> = {
    skills: [],
    workExperience: [],
    education: [],
  };
  let activeSection: keyof SplitSectionsResult | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      if (activeSection) {
        sections[activeSection].push("");
      }

      continue;
    }

    const heading = classifySectionHeading(line);

    if (heading) {
      activeSection = heading;
      continue;
    }

    if (activeSection) {
      sections[activeSection].push(line);
    }
  }

  return {
    skills: normalizeDocumentWhitespace(sections.skills.join("\n")),
    workExperience: normalizeDocumentWhitespace(sections.workExperience.join("\n")),
    education: normalizeDocumentWhitespace(sections.education.join("\n")),
  };
}

function splitTopLevelCommaItems(value: string) {
  const items: string[] = [];
  let current = "";
  let depth = 0;

  for (const character of value) {
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

    if (character === "," && depth === 0) {
      const entry = current.trim();

      if (entry) {
        items.push(entry);
      }

      current = "";
      continue;
    }

    current += character;
  }

  const finalEntry = current.trim();

  if (finalEntry) {
    items.push(finalEntry);
  }

  return items;
}

function splitTopLevelDotItems(value: string) {
  const items: string[] = [];
  let current = "";
  let depth = 0;

  for (const character of value) {
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

    if ((character === "·" || character === "•") && depth === 0) {
      const entry = current.trim();

      if (entry) {
        items.push(entry);
      }

      current = "";
      continue;
    }

    current += character;
  }

  const finalEntry = current.trim();

  if (finalEntry) {
    items.push(finalEntry);
  }

  return items;
}

function countTopLevelSeparators(value: string, separators: string[]) {
  let depth = 0;
  let count = 0;

  for (const character of value) {
    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0 && separators.includes(character)) {
      count += 1;
    }
  }

  return count;
}

function parseGroupedSkills(skillsSection: string): GroupedSkillSet[] {
  if (!skillsSection) {
    return [];
  }

  // Step 3: preserve grouped skills losslessly, only splitting on top-level commas.
  const groups: GroupedSkillSet[] = [];
  let currentCategory = "";
  let currentContent: string[] = [];

  const pushCurrent = () => {
    if (!currentCategory) {
      return;
    }

    const content = currentContent.join(" ").trim();
    const topLevelCommaCount = countTopLevelSeparators(content, [","]);
    const topLevelDotCount = countTopLevelSeparators(content, ["·", "•"]);
    const rawItems = (
      topLevelDotCount > 0 && topLevelDotCount >= topLevelCommaCount
          ? splitTopLevelDotItems(content)
          : topLevelCommaCount > 0
            ? splitTopLevelCommaItems(content)
            : [content]
    )
      .map((item) => item.trim())
      .filter(Boolean);

    groups.push({
      category: currentCategory,
      items: rawItems,
    });
  };

  for (const rawLine of skillsSection.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const categoryMatch =
      line.match(/^([^:]{1,64}):\s*(.*)$/) ??
      SKILL_CATEGORY_NAMES.map((category) => {
        const match = line.match(
          new RegExp(
            `^(${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s+(.+)$`,
            "i",
          ),
        );

        if (!match) {
          return null;
        }

        return [match[0], match[1], match[2]];
      }).find(Boolean);

    if (categoryMatch) {
      pushCurrent();
      currentCategory = categoryMatch[1].trim();
      currentContent = [categoryMatch[2].trim()];
      continue;
    }

    if (currentCategory) {
      currentContent.push(line);
    }
  }

  pushCurrent();

  return groups.filter((group) => group.category && group.items.length > 0);
}

function parseDateRange(text: string) {
  const match = text.match(DATE_RANGE_PATTERN);

  return {
    startDate: match?.[1]?.trim() ?? "",
    endDate: match?.[2]?.trim() ?? "",
  };
}

function looksLikeLocationLine(line: string) {
  return Boolean(formatResumeLocation(line) || /\b(?:remote|hybrid|on-site|onsite)\b/i.test(line));
}

function splitCompanyAndLocationLine(line: string) {
  const parts = line
    .split(/[·•|]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const company = parts.find((value) => !looksLikeLocationLine(value)) ?? "";
  const location = parts.find((value) => looksLikeLocationLine(value)) ?? "";

  return {
    company,
    location,
  };
}

function looksLikeRoleStart(line: string, nextLine: string, aggressive: boolean) {
  if (!line || BULLET_PREFIX_PATTERN.test(line) || looksLikeSectionHeading(line)) {
    return false;
  }

  if (DEGREE_SIGNAL_PATTERN.test(line) && !EXPERIENCE_ROLE_SIGNAL_PATTERN.test(line)) {
    return false;
  }

  if (INLINE_ROLE_WITH_DATE_PATTERN.test(line)) {
    return true;
  }

  if (DATE_RANGE_PATTERN.test(line) && EXPERIENCE_ROLE_SIGNAL_PATTERN.test(line)) {
    return true;
  }

  if (
    aggressive &&
    EXPERIENCE_ROLE_SIGNAL_PATTERN.test(line) &&
    DATE_RANGE_PATTERN.test(nextLine)
  ) {
    return true;
  }

  return false;
}

function splitExperienceBlocks(sectionText: string, options: ParseOptions = {}) {
  if (!sectionText) {
    return [];
  }

  const lines = sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !looksLikeNoiseLine(line));
  const blocks: string[][] = [];
  let current: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextLine = lines[index + 1] ?? "";
    const newBlock = looksLikeRoleStart(line, nextLine, Boolean(options.aggressive));

    if (newBlock && current.length > 0) {
      blocks.push(current);
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  return blocks.filter((block) => block.some((line) => line.trim()));
}

function extractResponsibilities(lines: string[]) {
  const responsibilities: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const cleaned = line.replace(BULLET_PREFIX_PATTERN, "").trim();

    if (!cleaned) {
      continue;
    }

    if (!responsibilities.length) {
      responsibilities.push(cleaned);
      continue;
    }

    const previous = responsibilities[responsibilities.length - 1] ?? "";
    const shouldAppend =
      !BULLET_PREFIX_PATTERN.test(line) &&
      !looksLikeLocationLine(cleaned) &&
      !DATE_RANGE_PATTERN.test(cleaned) &&
      !looksLikeSectionHeading(cleaned) &&
      (!/[.!?]$/.test(previous) || /^[a-z(]/.test(cleaned));

    if (shouldAppend) {
      responsibilities[responsibilities.length - 1] = normalizeInlineSpaces(
        `${previous} ${cleaned}`,
      );
      continue;
    }

    responsibilities.push(cleaned);
  }

  return responsibilities.filter(Boolean);
}

function splitRoleAndCompany(headerLine: string) {
  const line = headerLine.trim();
  const separatorMatch = line.match(/^(.+?)\s+[·|•—-]\s+(.+)$/);

  if (!separatorMatch) {
    const tokens = line.split(/\s+/);

    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      const titleCandidate = tokens.slice(0, index + 1).join(" ").trim();
      const companyCandidate = tokens.slice(index + 1).join(" ").trim();

      if (
        companyCandidate &&
        EXPERIENCE_ROLE_SIGNAL_PATTERN.test(titleCandidate) &&
        !EXPERIENCE_ROLE_SIGNAL_PATTERN.test(companyCandidate)
      ) {
        return {
          title: titleCandidate,
          company: companyCandidate,
        };
      }
    }

    return {
      title: line,
      company: "",
    };
  }

  return {
    title: separatorMatch[1].trim(),
    company: separatorMatch[2].trim(),
  };
}

function parseExperienceBlock(block: string[]) {
  const meaningfulLines = block.filter((line) => line.trim());

  if (!meaningfulLines.length) {
    return null;
  }

  const headerLines: string[] = [];
  const bodyLines: string[] = [];
  let hitBody = false;

  for (const line of meaningfulLines) {
    if (
      !hitBody &&
      !BULLET_PREFIX_PATTERN.test(line) &&
      !/^[A-Z][a-z].+[.!?]$/.test(line)
    ) {
      headerLines.push(line);
      continue;
    }

    hitBody = true;
    bodyLines.push(line);
  }

  if (!headerLines.length) {
    headerLines.push(meaningfulLines[0] ?? "");
  }

  const firstHeader = headerLines[0] ?? "";
  const inlineRoleMatch = firstHeader.match(INLINE_ROLE_WITH_DATE_PATTERN);
  const firstHeaderDateMatch = firstHeader.match(DATE_RANGE_PATTERN);
  const beforeDate =
    firstHeaderDateMatch && typeof firstHeaderDateMatch.index === "number"
      ? firstHeader.slice(0, firstHeaderDateMatch.index).trim()
      : firstHeader.replace(DATE_RANGE_PATTERN, "").trim();
  const afterDate =
    firstHeaderDateMatch && typeof firstHeaderDateMatch.index === "number"
      ? firstHeader.slice(firstHeaderDateMatch.index + firstHeaderDateMatch[0].length).trim()
      : "";
  const inlineTitle = inlineRoleMatch?.[1]?.trim() ?? beforeDate;
  const dateSource = headerLines.find((line) => DATE_RANGE_PATTERN.test(line)) ?? firstHeader;
  const { startDate, endDate } = parseDateRange(dateSource);
  const inlineLocation = afterDate;
  const roleAndCompany = splitRoleAndCompany(
    beforeDate || inlineTitle.replace(DATE_RANGE_PATTERN, "").trim(),
  );
  const splitHeaderMetadata = splitCompanyAndLocationLine(headerLines[1] ?? "");
  const companyLine =
    headerLines
      .slice(1)
      .find((line) => {
        const normalized = line.replace(DATE_RANGE_PATTERN, "").trim();
        return (
          normalized &&
          !looksLikeLocationLine(normalized) &&
          !DEGREE_SIGNAL_PATTERN.test(normalized)
        );
      }) ??
    splitHeaderMetadata.company;
  const location =
    [inlineLocation, splitHeaderMetadata.location, ...headerLines]
      .map((line) => line.replace(/^[·•|]\s*/, "").trim())
      .find((line) => looksLikeLocationLine(line)) ?? "";
  const locationMetadata = splitCompanyAndLocationLine(location);
  const responsibilities = extractResponsibilities(bodyLines);

  return {
    job_title: roleAndCompany.title,
    company_name: roleAndCompany.company || companyLine || locationMetadata.company,
    location: (locationMetadata.location || location).trim(),
    start_date: startDate,
    end_date: endDate,
    responsibilities,
  };
}

function parseWorkExperienceBlocks(
  sectionText: string,
  options: ParseOptions = {},
) {
  // Step 4: treat each detected role/date block as its own experience entry.
  return splitExperienceBlocks(sectionText, options)
    .map((block) => parseExperienceBlock(block))
    .filter(
      (entry): entry is NonNullable<typeof entry> =>
        Boolean(
          entry &&
            (entry.job_title ||
              entry.company_name ||
              entry.start_date ||
              entry.end_date ||
              entry.responsibilities.length),
        ),
    );
}

function parseEducationBlocks(sectionText: string) {
  if (!sectionText) {
    return [];
  }

  // Step 5: force education detection when degree-like signals are visibly present.
  const lines = sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !looksLikeNoiseLine(line));
  const entries: ParsedResume["education"] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (
      !DEGREE_START_PATTERN.test(line) &&
      !(INSTITUTION_SIGNAL_PATTERN.test(line) && DATE_RANGE_PATTERN.test(line))
    ) {
      continue;
    }

    const nextLine = lines[index + 1] ?? "";
    const combined = `${line} ${nextLine}`.trim();
    const { startDate, endDate } = parseDateRange(combined);
    const lineDateMatch = line.match(DATE_RANGE_PATTERN);
    const degreeText = line.replace(DATE_RANGE_PATTERN, "").trim();
    const fieldMatch = degreeText.match(FIELD_OF_STUDY_PATTERN);
    const trailingAfterDate =
      lineDateMatch && typeof lineDateMatch.index === "number"
        ? line.slice(lineDateMatch.index + lineDateMatch[0].length).trim()
        : "";
    const sameLineInstitutionCandidate =
      [trailingAfterDate, degreeText]
        .find((value) => INSTITUTION_SIGNAL_PATTERN.test(value)) ?? "";
    const institutionSource =
      sameLineInstitutionCandidate ||
      (
      [nextLine, lines[index + 2] ?? ""]
        .map((value) => value.replace(DATE_RANGE_PATTERN, "").trim())
        .find((value) => INSTITUTION_SIGNAL_PATTERN.test(value))
      ) ||
      [nextLine, lines[index + 2] ?? ""]
        .map((value) => value.replace(DATE_RANGE_PATTERN, "").trim())
        .find((value) => Boolean(value) && !looksLikeNoiseLine(value)) ||
      "";
    const institutionParts = institutionSource
      .split(/[·|•]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const institution =
      institutionParts.find((value) => INSTITUTION_SIGNAL_PATTERN.test(value)) ??
      institutionParts[0] ??
      institutionSource;
    const institutionIndexInDegree = degreeText.search(INSTITUTION_SIGNAL_PATTERN);
    const institutionLocationParts = institutionSource
      .split(/[·|•]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const location =
      institutionLocationParts.find((value) => looksLikeLocationLine(value)) ??
      [lines[index + 1], lines[index + 2], trailingAfterDate]
        .map((value) => value?.trim() ?? "")
        .find((value) => looksLikeLocationLine(value)) ??
      "";

    entries.push({
      degree:
        fieldMatch
          ? degreeText.slice(0, fieldMatch.index).trim().replace(/\bin$/i, "").trim()
          : institutionIndexInDegree > 0
            ? degreeText.slice(0, institutionIndexInDegree).trim()
          : sameLineInstitutionCandidate
            ? degreeText.replace(sameLineInstitutionCandidate, "").trim()
            : degreeText,
      field_of_study: fieldMatch?.[1]?.trim() ?? "",
      institution_name:
        institutionLocationParts.find((value) => !looksLikeLocationLine(value)) ??
        institution,
      location,
      start_date: startDate,
      end_date: endDate,
      grade: "",
    });
  }

  return entries.filter((entry) => {
    if (entry.start_date || entry.end_date || entry.institution_name) {
      return true;
    }

    return DEGREE_START_PATTERN.test(entry.degree);
  });
}

export function parseResume(text: string, options: ParseOptions = {}): ParsedResume {
  const preprocessedText = preprocessResumeText(text);
  const sections = splitSections(preprocessedText);

  return {
    work_experience: parseWorkExperienceBlocks(sections.workExperience, options),
    education: parseEducationBlocks(sections.education),
    skills: {
      grouped_skills: parseGroupedSkills(sections.skills),
    },
  };
}

function countExpectedRoles(text: string) {
  const preprocessedText = preprocessResumeText(text);
  const section = splitSections(preprocessedText).workExperience;

  if (!section) {
    return 0;
  }

  return splitExperienceBlocks(section, { aggressive: true }).length;
}

function countExpectedSkillCategories(text: string) {
  const preprocessedText = preprocessResumeText(text);
  const section = splitSections(preprocessedText).skills;

  if (!section) {
    return 0;
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[^:]{1,64}:\s*/.test(line)).length;
}

function hasTruncatedBullet(responsibilities: string[]) {
  return responsibilities.some((entry) => {
    const trimmed = entry.trim();

    return (
      trimmed.length < 12 ||
      /\b(?:and|or|with|for|to|from|of|in|on)$/i.test(trimmed) ||
      (!/[.!?)]$/.test(trimmed) && trimmed.split(/\s+/).length < 6)
    );
  });
}

export function validateParsedResume(
  parsed: ParsedResume,
  rawText: string,
): ValidationResult {
  // Step 6: compare parsed structure against visible signals in the source text.
  const errors: string[] = [];
  const expectedRoleCount = countExpectedRoles(rawText);
  const expectedSkillCategories = countExpectedSkillCategories(rawText);

  if (
    expectedRoleCount > 0 &&
    parsed.work_experience.length !== expectedRoleCount
  ) {
    errors.push(
      `Expected ${expectedRoleCount} work experience entries but parsed ${parsed.work_experience.length}.`,
    );
  }

  if (
    expectedSkillCategories > 0 &&
    parsed.skills.grouped_skills.length !== expectedSkillCategories
  ) {
    errors.push(
      `Expected ${expectedSkillCategories} skill categories but parsed ${parsed.skills.grouped_skills.length}.`,
    );
  }

  if (
    /\b(?:Bachelor|Master|University)\b/i.test(rawText) &&
    parsed.education.length === 0
  ) {
    errors.push("Education appears in the resume text but no education entry was parsed.");
  }

  if (
    parsed.work_experience.some(
      (entry) =>
        !entry.job_title ||
        !entry.company_name ||
        entry.responsibilities.length === 0,
    )
  ) {
    errors.push("One or more work experience entries are missing title, company, or responsibilities.");
  }

  if (
    parsed.work_experience.some((entry) => hasTruncatedBullet(entry.responsibilities))
  ) {
    errors.push("One or more work experience bullets appear truncated or fragmented.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function toResumeExperience(
  value: ParsedResume["work_experience"][number],
): ResumeExperience {
  return {
    title: value.job_title,
    company: value.company_name,
    location: value.location,
    startDate: value.start_date,
    endDate: value.end_date,
    description: value.responsibilities,
  };
}

function toResumeEducation(
  value: ParsedResume["education"][number],
): ResumeEducation {
  const year = [value.start_date, value.end_date].filter(Boolean).join(" - ");
  const degree = value.field_of_study
    ? `${value.degree}${value.degree ? ", " : ""}${value.field_of_study}`
    : value.degree;
  const institution = [value.institution_name, value.location]
    .filter(Boolean)
    .join(" · ");

  return {
    degree,
    institution,
    year,
  };
}

export function parsedResumeToParsedResumeData(parsed: ParsedResume): ParsedResumeData {
  const parsedData = createEmptyParsedResumeData();

  parsedData.skills = parsed.skills.grouped_skills.flatMap((group) =>
    group.items.map((item) => `${group.category}: ${item}`),
  );
  parsedData.experience = parsed.work_experience.map((entry) =>
    toResumeExperience(entry),
  );
  parsedData.education = parsed.education.map((entry) =>
    toResumeEducation(entry),
  );

  return parsedData;
}

export function parseWithValidation(rawText: string): ParseWithValidationResult {
  const preprocessedText = preprocessResumeText(rawText);
  let parsed = parseResume(preprocessedText);
  let validation = validateParsedResume(parsed, preprocessedText);

  if (!validation.isValid) {
    // Retry once with a slightly more permissive role-boundary pass.
    parsed = parseResume(preprocessedText, { aggressive: true });
    validation = validateParsedResume(parsed, preprocessedText);
  }

  return {
    preprocessedText,
    parsed,
    parsedData: parsedResumeToParsedResumeData(parsed),
    validation,
  };
}
