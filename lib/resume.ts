import { Types } from "@/lib/id";
import {
  type ExtractedProfileLink,
  normalizeProfileUrl,
  normalizePhoneValue,
} from "@/lib/contact-info";
import { formatResumeLocation } from "@/lib/location";
import { sanitizeTechnicalSkills } from "@/lib/technical-skills";

export type ResumeProfileLink = ExtractedProfileLink;

export type ResumePersonalInfo = {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  links: ResumeProfileLink[];
};

export type ResumeExperience = {
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string[];
};

export type ResumeEducation = {
  degree: string;
  institution: string;
  year: string;
};

export const RESUME_SECTION_KEYS = [
  "personalInfo",
  "summary",
  "skills",
  "experience",
  "education",
] as const;

export type ResumeSectionKey = (typeof RESUME_SECTION_KEYS)[number];

export type ResumeSectionExtractionMeta = {
  source: "local" | "ai" | "merged";
  confidence: number;
  updatedAt: string | null;
  issues: string[];
};

export type ResumeExtractionMeta = {
  rawTextAvailable: boolean;
  sections: Record<ResumeSectionKey, ResumeSectionExtractionMeta>;
};

export type ParsedResumeData = {
  personalInfo: ResumePersonalInfo;
  summary: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
};

export type ResumeSectionCompleteness = {
  personalInfo: boolean;
  summary: boolean;
  skills: boolean;
  experience: boolean;
  education: boolean;
};

export type ResumeAnalysisReport = {
  score: number;
  missingKeywords: string[];
  tips: string[];
  sectionCompleteness: ResumeSectionCompleteness;
  readabilityScore: number;
};

export type SafeResume = {
  id: string;
  fileName: string;
  originalUrl: string | null;
  parsedData: ParsedResumeData;
  analysisReport: ResumeAnalysisReport;
  createdAt: string | null;
};

export type ResumeSummary = Pick<SafeResume, "id" | "fileName" | "createdAt">;

type ResumeLike = {
  _id: Types.ObjectId | string;
  fileName: string;
  originalUrl?: string | null;
  rawText?: string | null;
  parsedData?: unknown;
  analysisReport?: unknown;
  extractionMeta?: unknown;
  createdAt?: Date | string | null;
};

function normalizeString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim();

  return /^(?:n\/a|na|none|null|not specified|not available|unknown)$/i.test(
    normalizedValue,
  )
    ? ""
    : normalizedValue;
}

/**
 * Returns "" when the extracted value is literally the field name itself
 * (e.g. name="name", email="email").  This happens when a weak AI model
 * copies the JSON schema template verbatim instead of filling in real values.
 */
function stripFieldPlaceholder(value: string, fieldName: string): string {
  return value.toLowerCase() === fieldName.toLowerCase() ? "" : value;
}

function normalizeStringArray(value: unknown, limit = 200) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .slice(0, limit);
}

function buildComparableTitlePattern(value: string) {
  const tokens = value.match(/[A-Za-z0-9]+/g) ?? [];

  if (!tokens.length) {
    return null;
  }

  return new RegExp(`^${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*")}\\b`, "i");
}

const EXPERIENCE_BULLET_SPLIT_PATTERN =
  /(?<=[.!?])\s+(?=(?:Built|Led|Implemented|Integrated|Worked|Designed|Architected|Introduced|Championed|Mentored|Managed|Created|Developed|Launched|Reduced|Improved|Optimized|Owned|Collaborated|Drove|Delivered|Migrated|Refactored|Automated|Scaled|Rebuilt|Served|Supported|Cut|Raised|Increased|Decreased|Boosted|Took)\b)/g;
const DESCRIPTION_LOCATION_PREFIX_PATTERN =
  /^([A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+(?:\s*[·|]\s*(?:Remote|Hybrid|On-?site|Onsite|In-?office))?)\s+(?=(?:Built|Led|Implemented|Integrated|Worked|Designed|Architected|Introduced|Championed|Mentored|Managed|Created|Developed|Launched|Reduced|Improved|Optimized|Owned|Collaborated|Drove|Delivered|Migrated|Refactored|Automated|Scaled|Rebuilt|Served|Supported|Cut|Raised|Increased|Decreased|Boosted|Took)\b)/i;

function cleanExperienceDescriptionEntry(value: string) {
  return normalizeString(value.replace(DESCRIPTION_LOCATION_PREFIX_PATTERN, ""));
}

function normalizeExperienceDescriptionArray(value: unknown, limit = 200) {
  const descriptions = normalizeStringArray(value, limit)
    .map((entry) => cleanExperienceDescriptionEntry(entry))
    .filter(Boolean);

  if (descriptions.length !== 1) {
    return descriptions;
  }

  const [singleDescription] = descriptions;

  if (singleDescription.length < 220) {
    return descriptions;
  }

  const splitDescriptions = singleDescription
    .split(EXPERIENCE_BULLET_SPLIT_PATTERN)
    .map((entry) => cleanExperienceDescriptionEntry(entry))
    .filter(Boolean);

  return splitDescriptions.length > 1
    ? splitDescriptions.slice(0, limit)
    : descriptions;
}

// Splits a free-text skill blob like "Python, JavaScript, TypeScript" or
// "Python; JavaScript / TypeScript" into individual entries. Conservative —
// only splits on commas, semicolons, bullets, pipes, and explicit list breaks.
// Does NOT split on "/" or "&" (those are commonly part of a single skill,
// e.g. "AI/ML", "CI/CD", "Tailwind/CSS").
function splitSkillStringIntoEntries(value: string): string[] {
  return value
    .split(/[,;|•·]+|\r?\n+/)
    .map((entry) => normalizeString(entry))
    .filter((entry) => entry.length > 0);
}

function joinGroupAndSkill(group: string, skill: string): string {
  const cleanedGroup = group.trim();
  const cleanedSkill = skill.trim();
  if (!cleanedSkill) {
    return "";
  }
  if (!cleanedGroup) {
    return cleanedSkill;
  }
  // Avoid double-prefixing if the model already inlined the group.
  const lowerSkill = cleanedSkill.toLowerCase();
  const lowerGroup = cleanedGroup.toLowerCase();
  if (
    lowerSkill === lowerGroup ||
    lowerSkill.startsWith(`${lowerGroup}:`) ||
    lowerSkill.startsWith(`${lowerGroup} -`) ||
    lowerSkill.startsWith(`${lowerGroup} —`)
  ) {
    return cleanedSkill;
  }
  return `${cleanedGroup}: ${cleanedSkill}`;
}

/**
 * Flattens any realistic LLM "skills" shape into a flat array of strings.
 *
 * Handles:
 *   - Plain string ("Python")
 *   - Comma/semicolon-delimited string ("Python, JS, TS")
 *   - Array of any of the supported shapes (recurses)
 *   - Object map: { Languages: ["Python", "JS"], Backend: ["Node"] }
 *   - Object with category + items: { category: "Languages", items: [...] }
 *   - Object with category + skills: { name: "Languages", skills: [...] }
 *   - Object with group + skill (legacy): { group: "Languages", skill: "Python" }
 *
 * Returns deduped, trimmed strings prefixed with "Group: " when a group/category
 * was present.
 */
// If a string starts with "<Category>: rest of line", peel the category off so
// we can apply it to every comma-split part. Returns null when no leading
// group prefix is present. Limits the category portion to a reasonable length
// to avoid mis-detecting URLs ("https://...") or sentences with stray colons.
function peelLeadingGroupFromString(
  value: string,
): { group: string; rest: string } | null {
  const match = value.match(/^([^:\n]{1,48}):\s+(.+)$/);
  if (!match) {
    return null;
  }
  const groupCandidate = match[1].trim();
  const rest = match[2].trim();
  // Heuristic: a real category label is short, doesn't contain commas, and
  // isn't itself a comma-list. Skip when the "group" looks like a sentence.
  if (!groupCandidate || groupCandidate.includes(",") || !rest) {
    return null;
  }
  return { group: groupCandidate, rest };
}

/**
 * Strict-copy leading-category detector.
 *
 * Returns the leading category + body when a string entry literally STARTS
 * with a real category header pattern, e.g.
 *   "Cloud & DevOps: AWS (Certified)"   → category="Cloud & DevOps", body="AWS (Certified)"
 *   "AI & ML: LLM Integration"           → category="AI & ML", body="LLM Integration"
 *   "Data Engineering: Apache Spark"     → category="Data Engineering", body="Apache Spark"
 *
 * Used inside arrays under a parent group: when an array entry starts with a
 * different category header than the array's current group, that's a category
 * switch — items that follow it belong to the new category, not the parent.
 *
 * STRICT-COPY semantics: this never invents partial categories like "Cloud &"
 * or "DevOps" alone. It only matches a complete capitalized phrase (1–4 words,
 * optionally joined by space, &, or /), so multi-word labels like
 * "Cloud & DevOps" stay intact instead of being split into "Cloud &" + "DevOps".
 *
 * Returns null when the string doesn't start with a plausible category header.
 */
function detectLeadingCategoryHeader(
  value: string,
): { category: string; body: string } | null {
  // Capitalized first word, optionally joined to up to 3 more capitalized
  // words by space, `&`, or `/` connectors. Greedy on the chain so
  // "Cloud & DevOps" matches as a single unit.
  const headerPattern =
    /^([A-Z][\w]*(?:[\s/&]+[A-Z][\w]*){0,3})\s*:\s+(.+)$/;
  const match = value.match(headerPattern);
  if (!match) {
    return null;
  }
  const category = match[1].trim().replace(/\s+/g, " ");
  const body = match[2].trim();
  if (!category || !body) {
    return null;
  }
  // Real category labels are short.
  if (category.length > 36) {
    return null;
  }
  return { category, body };
}

/**
 * Walks a list of skill string parts under a starting group, emitting
 * "Group: skill" entries. STRICT-COPY: never fabricates category fragments;
 * only detects when an entry literally starts with a complete category header
 * different from the current group, treating that as a category switch.
 */
function flattenStringPartsWithCollisionFix(
  parts: string[],
  startingGroup: string,
): { items: string[]; finalGroup: string } {
  const out: string[] = [];
  let currentGroup = startingGroup;

  for (const rawPart of parts) {
    const part = normalizeString(rawPart);
    if (!part) {
      continue;
    }

    // Inside an active group, an entry that literally starts with a different
    // "<Category>: ..." header signals a category switch. The new category
    // applies to the rest of THIS string and to subsequent siblings until
    // another switch happens.
    if (currentGroup) {
      const header = detectLeadingCategoryHeader(part);
      if (
        header &&
        header.category.toLowerCase() !== currentGroup.toLowerCase()
      ) {
        currentGroup = header.category;
        // Body may be a comma-list ("AWS, GCP, Docker"), so split and emit each.
        const bodyParts = splitSkillStringIntoEntries(header.body);
        const toEmit = bodyParts.length > 0 ? bodyParts : [header.body];
        for (const bodyPart of toEmit) {
          const v = joinGroupAndSkill(currentGroup, bodyPart);
          if (v) {
            out.push(v);
          }
        }
        continue;
      }
    }

    const v = joinGroupAndSkill(currentGroup, part);
    if (v) {
      out.push(v);
    }
  }

  return { items: out, finalGroup: currentGroup };
}

/**
 * Unified handling for a single string skill entry under an active group.
 * Performs (in order): trim → peel leading "Group:" prefix when no parent
 * group is active → comma-split → collision-fix walk.
 *
 * Returns the produced items and the group that was active after the last
 * item, so the caller can carry it across array siblings.
 */
function processStringSkillEntry(
  raw: unknown,
  parentGroup: string,
): { items: string[]; finalGroup: string } {
  if (typeof raw !== "string") {
    return { items: [], finalGroup: parentGroup };
  }
  const cleaned = normalizeString(raw);
  if (!cleaned) {
    return { items: [], finalGroup: parentGroup };
  }
  // Peel a leading "Group: rest" prefix only when we don't already have a
  // parent group from the surrounding structure.
  const peeled = !parentGroup ? peelLeadingGroupFromString(cleaned) : null;
  const effectiveGroup = peeled ? peeled.group : parentGroup;
  const body = peeled ? peeled.rest : cleaned;
  const parts = splitSkillStringIntoEntries(body);
  const partList = parts.length > 0 ? parts : [body];
  return flattenStringPartsWithCollisionFix(partList, effectiveGroup);
}

function flattenSkillsValue(value: unknown, group = ""): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return processStringSkillEntry(value, group).items;
  }

  if (Array.isArray(value)) {
    const out: string[] = [];
    // Track currentGroup across siblings so an inline collision in one entry
    // re-tags the items that follow it (e.g. once "WebSockets AI & ML:" appears
    // mid-list, every subsequent item is an AI & ML skill, not a Frontend one).
    let currentGroup = group;
    for (const entry of value) {
      if (typeof entry === "string") {
        const result = processStringSkillEntry(entry, currentGroup);
        out.push(...result.items);
        currentGroup = result.finalGroup;
      } else {
        out.push(...flattenSkillsValue(entry, currentGroup));
      }
    }
    return out;
  }

  if (typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;

  // Shape A: explicit category/group with a nested list of items.
  // Checked BEFORE Shape B because shape A's "name" key is a category label,
  // not a skill — the disambiguator is the presence of an items/skills array.
  const itemsRaw =
    record.items ?? record.values ?? record.list ?? record.skills;
  const itemsIsList =
    itemsRaw !== undefined &&
    itemsRaw !== null &&
    (Array.isArray(itemsRaw) || typeof itemsRaw === "string");
  if (itemsIsList) {
    const categoryRaw =
      record.category ??
      record.group ??
      record.heading ??
      record.section ??
      record.name ??
      record.label;
    const nestedGroup =
      typeof categoryRaw === "string"
        ? normalizeString(categoryRaw) || group
        : group;
    return flattenSkillsValue(itemsRaw, nestedGroup);
  }

  // Shape B: legacy { group, skill | name | label } — a single leaf skill.
  const legacySkill =
    normalizeString(record.skill) ||
    normalizeString(record.name) ||
    normalizeString(record.label);
  if (legacySkill) {
    const legacyGroup = normalizeString(record.group) || group;
    return [joinGroupAndSkill(legacyGroup, legacySkill)].filter(Boolean);
  }

  // Shape C: object map { "Languages": [...], "Backend": [...] }.
  // Each key acts as a group label for its nested value.
  const out: string[] = [];
  for (const [key, nestedValue] of Object.entries(record)) {
    const nestedGroup = normalizeString(key) || group;
    out.push(...flattenSkillsValue(nestedValue, nestedGroup));
  }
  return out;
}


function normalizeSkills(value: unknown, limit = 200) {
  // STRICT COPY semantics: tolerate any realistic LLM shape, then preserve
  // every skill the model emitted. The only filter applied here is exact-match
  // de-duplication (case-insensitive) — a skill that appears twice byte-for-byte
  // in the same list is collapsed once.
  //
  // Deliberately DOES NOT drop substring-supersets: if the resume legitimately
  // lists both "React" and "React Native" under Frontend, both must survive.
  // Removing that aggressive heuristic was the key fix for strict-copy mode.
  const flattened = flattenSkillsValue(value);
  const skills: string[] = [];
  const seen = new Set<string>();

  for (const candidate of flattened) {
    const normalizedSkill = normalizeString(candidate);
    const comparableSkill = normalizeComparableText(normalizedSkill);

    if (!normalizedSkill || !comparableSkill || seen.has(comparableSkill)) {
      continue;
    }

    seen.add(comparableSkill);
    skills.push(normalizedSkill);

    if (skills.length >= limit) {
      break;
    }
  }

  return skills;
}

function normalizeProfileLink(value: unknown): ResumeProfileLink | null {
  const record = normalizeRecord(value);
  const url = normalizeProfileUrl(normalizeString(record.url));

  if (!url) {
    return null;
  }

  const rawType = normalizeString(record.type).toLowerCase();
  const type = [
    "linkedin",
    "github",
    "gitlab",
    "bitbucket",
    "portfolio",
    "website",
    "other",
  ].includes(rawType)
    ? (rawType as ResumeProfileLink["type"])
    : "other";

  return {
    type,
    label: normalizeString(record.label) || "Link",
    url,
  };
}

function normalizeSummaryText(value: string, title: string) {
  let summary = normalizeString(value)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, lines) => line || (index > 0 && index < lines.length - 1))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!summary) {
    return "";
  }

  const comparableTitle = normalizeComparableText(title);
  const titlePattern = title ? buildComparableTitlePattern(title) : null;

  if (titlePattern) {
    summary = summary.replace(titlePattern, "").trim();
  }

  if (
    comparableTitle &&
    normalizeComparableText(summary).startsWith(comparableTitle)
  ) {
    summary = normalizeString(summary.slice(title.length));
  }

  if (
    /(?:linkedin\.com|github\.com|gitlab\.com|bitbucket\.org|@)/i.test(summary) &&
    summary.split(/\s+/).length < 40
  ) {
    return "";
  }

  return summary;
}

function normalizeProfileLinks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const links: ResumeProfileLink[] = [];
  const seenUrls = new Set<string>();

  for (const entry of value) {
    const link = normalizeProfileLink(entry);
    const normalizedUrl = link?.url.toLowerCase();

    if (!link || !normalizedUrl || seenUrls.has(normalizedUrl)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    links.push(link);
  }

  return links.slice(0, 8);
}

function normalizeRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isEducationFragment(value: string) {
  const normalizedValue = normalizeString(value);

  return (
    !normalizedValue ||
    /^[,.\s-]+/.test(normalizedValue) ||
    (!/[A-Za-z]/.test(normalizedValue)) ||
    formatResumeLocation(normalizedValue) === normalizedValue
  );
}

function clampScore(value: unknown) {
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(normalizeString(value));

  if (Number.isNaN(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const DATE_TOKEN_PATTERN =
  String.raw`(?:[A-Za-z]{3,9}\s+\d{4}|(?:0?[1-9]|1[0-2])[\/.-]\d{4}|\d{4})`;
const DATE_RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN_PATTERN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN_PATTERN}|present|current|now)`,
  "i",
);
const ROLE_KEYWORD_PATTERN =
  /\b(engineer|developer|manager|analyst|designer|architect|founder|director|lead|consultant|specialist|coordinator|intern|owner|president|officer|administrator|scientist)\b/i;
const TITLE_COMPANY_SEPARATOR_PATTERN = /\s+(?:·|•|\||–|—)\s+/;

function splitTitleCompany(value: string) {
  const parts = value
    .split(TITLE_COMPANY_SEPARATOR_PATTERN)
    .map((part) => normalizeString(part))
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const [title = "", company = ""] = parts;

  if (!ROLE_KEYWORD_PATTERN.test(title) || ROLE_KEYWORD_PATTERN.test(company)) {
    return null;
  }

  return { title, company };
}

function stripDateRange(value: string) {
  return normalizeString(value.replace(DATE_RANGE_PATTERN, " "));
}

function getDateRange(value: string) {
  const match = value.match(DATE_RANGE_PATTERN);

  return {
    startDate: normalizeString(match?.[1]),
    endDate: normalizeString(match?.[2]),
  };
}

function normalizeExperienceLocation(value: unknown) {
  const location = normalizeString(value);

  return formatResumeLocation(location) || location;
}

function normalizeExperienceEntry(value: unknown): ResumeExperience | null {
  const experience = normalizeRecord(value);
  let title = normalizeString(experience.title);
  let company = normalizeString(experience.company);
  const location = normalizeExperienceLocation(experience.location);
  let startDate = normalizeString(experience.startDate);
  let endDate = normalizeString(experience.endDate);
  let description = normalizeExperienceDescriptionArray(experience.description);

  if (!company) {
    const splitTitle = splitTitleCompany(title);

    if (splitTitle) {
      title = splitTitle.title;
      company = splitTitle.company;
    }
  }

  const splitCompany = splitTitleCompany(company);

  if (splitCompany && (!title || !ROLE_KEYWORD_PATTERN.test(title))) {
    description = title ? [title, ...description] : description;
    title = splitCompany.title;
    company = splitCompany.company;
  }

  if (!startDate || !endDate) {
    const titleDates = getDateRange(title);
    const companyDates = getDateRange(company);

    startDate = startDate || titleDates.startDate || companyDates.startDate;
    endDate = endDate || titleDates.endDate || companyDates.endDate;
    title = stripDateRange(title);
    company = stripDateRange(company);
  }

  return title || company || location || description.length > 0
    ? {
        title,
        company,
        location,
        startDate,
        endDate,
        description,
      }
    : null;
}

function parseEmbeddedExperienceLine(value: string): ResumeExperience | null {
  const line = normalizeString(value);
  const dateRange = getDateRange(line);

  if (!dateRange.startDate || !dateRange.endDate) {
    return null;
  }

  const beforeDate = normalizeString(line.slice(0, line.search(DATE_RANGE_PATTERN)));
  const afterDate = normalizeString(
    line.slice(line.search(DATE_RANGE_PATTERN)).replace(DATE_RANGE_PATTERN, ""),
  );
  const split = splitTitleCompany(beforeDate);

  if (!split) {
    return null;
  }

  return {
    title: split.title,
    company: split.company,
    location: normalizeExperienceLocation(afterDate),
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    description: [],
  };
}

function expandEmbeddedExperienceEntries(entries: ResumeExperience[]) {
  const expanded: ResumeExperience[] = [];

  for (const entry of entries) {
    const nextDescription: string[] = [];
    const embeddedEntries: ResumeExperience[] = [];

    for (const detail of entry.description) {
      const embeddedEntry = parseEmbeddedExperienceLine(detail);

      if (embeddedEntry) {
        embeddedEntries.push(embeddedEntry);
      } else {
        nextDescription.push(detail);
      }
    }

    expanded.push({ ...entry, description: nextDescription });
    expanded.push(...embeddedEntries);
  }

  return expanded;
}

function pickPreferredText(primary: string, fallback: string) {
  if (!primary) {
    return fallback;
  }

  if (!fallback) {
    return primary;
  }

  return primary.length >= fallback.length ? primary : fallback;
}

function mergeUniqueStrings(primary: string[], fallback: string[], limit = 30) {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const value of [...primary, ...fallback]) {
    const normalizedValue = normalizeComparableText(value);

    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    merged.push(value);
  }

  return merged.slice(0, limit);
}

function mergeUniqueProfileLinks(
  primary: ResumeProfileLink[],
  fallback: ResumeProfileLink[],
) {
  const merged: ResumeProfileLink[] = [];
  const seen = new Set<string>();

  for (const link of [...primary, ...fallback]) {
    const normalizedUrl = link.url.toLowerCase();

    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    merged.push(link);
  }

  return merged.slice(0, 8);
}

function scoreExperienceEntries(entries: ResumeExperience[]) {
  return entries.reduce((score, entry) => {
    let entryScore = 0;

    if (entry.title) {
      entryScore += 3;
    }

    if (entry.company) {
      entryScore += 2;
    }

    if (entry.startDate) {
      entryScore += 2;
    }

    if (entry.endDate) {
      entryScore += 1;
    }

    if (entry.location) {
      entryScore += 1;
    }

    if (entry.description.length) {
      entryScore += 2 + Math.min(entry.description.length, 5);

      if (entry.description.some((bullet) => bullet.split(/\s+/).length >= 6)) {
        entryScore += 1;
      }
    }

    return score + entryScore;
  }, entries.length * 4);
}

function scoreEducationEntries(entries: ResumeEducation[]) {
  return entries.reduce((score, entry) => {
    let entryScore = 0;

    if (entry.degree) {
      entryScore += 2;
    }

    if (entry.institution) {
      entryScore += 2;
    }

    if (entry.year) {
      entryScore += 1;
    }

    return score + entryScore;
  }, entries.length * 3);
}

function getExperienceIdentityKeys(entry: ResumeExperience) {
  const title = normalizeComparableText(entry.title);
  const company = normalizeComparableText(entry.company);
  const location = normalizeComparableText(entry.location);
  const startDate = normalizeComparableText(entry.startDate);
  const endDate = normalizeComparableText(entry.endDate);
  const firstBullet = normalizeComparableText(entry.description[0] ?? "");
  const keys = new Set<string>();

  if (title || company) {
    if (startDate || endDate) {
      keys.add(`role:${title}|${company}|${startDate}|${endDate}`);
    }

    if (location) {
      keys.add(`role:${title}|${company}|${location}`);
    }

    keys.add(`role:${title}|${company}`);
  }

  if (firstBullet) {
    keys.add(`bullet:${firstBullet}`);
  }

  return [...keys];
}

function areExperienceEntriesEquivalent(
  left: ResumeExperience,
  right: ResumeExperience,
) {
  const leftKeys = new Set(getExperienceIdentityKeys(left));

  return getExperienceIdentityKeys(right).some((key) => leftKeys.has(key));
}

function mergeExperienceEntry(
  primary: ResumeExperience,
  fallback: ResumeExperience,
): ResumeExperience {
  const primaryDescriptions =
    primary.description.length >= fallback.description.length
      ? primary.description
      : fallback.description;
  const secondaryDescriptions =
    primaryDescriptions === primary.description
      ? fallback.description
      : primary.description;

  return {
    title: pickPreferredText(primary.title, fallback.title),
    company: pickPreferredText(primary.company, fallback.company),
    location: pickPreferredText(primary.location, fallback.location),
    startDate: pickPreferredText(primary.startDate, fallback.startDate),
    endDate: pickPreferredText(primary.endDate, fallback.endDate),
    description: mergeUniqueStrings(primaryDescriptions, secondaryDescriptions, 8),
  };
}

function mergeExperienceArrays(
  primary: ResumeExperience[],
  fallback: ResumeExperience[],
) {
  const baseEntries =
    scoreExperienceEntries(primary) >= scoreExperienceEntries(fallback)
      ? primary
      : fallback;
  const secondaryEntries = baseEntries === primary ? fallback : primary;
  const merged = [...baseEntries];

  for (const secondaryEntry of secondaryEntries) {
    const matchingIndex = merged.findIndex((entry) =>
      areExperienceEntriesEquivalent(entry, secondaryEntry),
    );

    if (matchingIndex >= 0) {
      merged[matchingIndex] = mergeExperienceEntry(
        merged[matchingIndex] as ResumeExperience,
        secondaryEntry,
      );
      continue;
    }

    merged.push(secondaryEntry);
  }

  return merged.slice(0, 10);
}

function getEducationIdentityKeys(entry: ResumeEducation) {
  const degree = normalizeComparableText(entry.degree);
  const institution = normalizeComparableText(entry.institution);
  const year = normalizeComparableText(entry.year);
  const keys = new Set<string>();

  if (degree && institution) {
    keys.add(`education:${degree}|${institution}`);
  }

  if (institution && year) {
    keys.add(`education:${institution}|${year}`);
  }

  if (degree && year) {
    keys.add(`education:${degree}|${year}`);
  }

  if (degree || institution) {
    keys.add(`education:${degree}|${institution}|${year}`);
  }

  return [...keys];
}

function areEducationEntriesEquivalent(left: ResumeEducation, right: ResumeEducation) {
  const leftKeys = new Set(getEducationIdentityKeys(left));

  return getEducationIdentityKeys(right).some((key) => leftKeys.has(key));
}

function mergeEducationEntry(
  primary: ResumeEducation,
  fallback: ResumeEducation,
): ResumeEducation {
  return {
    degree: pickPreferredText(primary.degree, fallback.degree),
    institution: pickPreferredText(primary.institution, fallback.institution),
    year: pickPreferredText(primary.year, fallback.year),
  };
}

function mergeEducationArrays(primary: ResumeEducation[], fallback: ResumeEducation[]) {
  const baseEntries =
    scoreEducationEntries(primary) >= scoreEducationEntries(fallback)
      ? primary
      : fallback;
  const secondaryEntries = baseEntries === primary ? fallback : primary;
  const merged = [...baseEntries];

  for (const secondaryEntry of secondaryEntries) {
    const matchingIndex = merged.findIndex((entry) =>
      areEducationEntriesEquivalent(entry, secondaryEntry),
    );

    if (matchingIndex >= 0) {
      merged[matchingIndex] = mergeEducationEntry(
        merged[matchingIndex] as ResumeEducation,
        secondaryEntry,
      );
      continue;
    }

    merged.push(secondaryEntry);
  }

  return merged.slice(0, 10);
}

export function createEmptyParsedResumeData(): ParsedResumeData {
  return {
    personalInfo: {
      name: "",
      title: "",
      email: "",
      phone: "",
      location: "",
      links: [],
    },
    summary: "",
    skills: [],
    experience: [],
    education: [],
  };
}

export function createEmptyResumeExtractionMeta(): ResumeExtractionMeta {
  return {
    rawTextAvailable: false,
    sections: {
      personalInfo: {
        source: "local",
        confidence: 0,
        updatedAt: null,
        issues: [],
      },
      summary: {
        source: "local",
        confidence: 0,
        updatedAt: null,
        issues: [],
      },
      skills: {
        source: "local",
        confidence: 0,
        updatedAt: null,
        issues: [],
      },
      experience: {
        source: "local",
        confidence: 0,
        updatedAt: null,
        issues: [],
      },
      education: {
        source: "local",
        confidence: 0,
        updatedAt: null,
        issues: [],
      },
    },
  };
}

export function createEmptyAnalysisReport(): ResumeAnalysisReport {
  return {
    score: 0,
    missingKeywords: [],
    tips: [],
    sectionCompleteness: {
      personalInfo: false,
      summary: false,
      skills: false,
      experience: false,
      education: false,
    },
    readabilityScore: 0,
  };
}

export function normalizeParsedResumeData(value: unknown): ParsedResumeData {
  const base = createEmptyParsedResumeData();
  const record = normalizeRecord(value);
  const personalInfo = normalizeRecord(record.personalInfo);

  const normalizedTitle = stripFieldPlaceholder(normalizeString(personalInfo.title), "title");
  const normalizedSummary = normalizeSummaryText(
    stripFieldPlaceholder(normalizeString(record.summary), "summary"),
    normalizedTitle,
  );

  return {
    personalInfo: {
      name: stripFieldPlaceholder(normalizeString(personalInfo.name), "name"),
      title: normalizedTitle,
      email: stripFieldPlaceholder(normalizeString(personalInfo.email), "email"),
      phone: normalizePhoneValue(stripFieldPlaceholder(normalizeString(personalInfo.phone), "phone")),
      location: formatResumeLocation(stripFieldPlaceholder(normalizeString(personalInfo.location), "location")),
      links: normalizeProfileLinks(personalInfo.links),
    },
    summary: normalizedSummary,
    skills: sanitizeTechnicalSkills(
      normalizeSkills(record.skills, 200).filter(
        (s) => s.toLowerCase() !== "skills" && s.toLowerCase() !== "skill",
      ),
    ),
    experience: Array.isArray(record.experience)
      ? expandEmbeddedExperienceEntries(
          record.experience
            .map((entry) => normalizeExperienceEntry(entry))
            .filter((entry): entry is ResumeExperience => Boolean(entry)),
        )
          .slice(0, 10)
      : base.experience,
    education: Array.isArray(record.education)
      ? record.education
          .map((entry) => {
            const education = normalizeRecord(entry);

            const degree = normalizeString(education.degree);
            const institution = normalizeString(education.institution);
            const year = normalizeString(education.year);

            return {
              degree,
              institution,
              year,
            };
          })
          .filter(
            (entry) =>
              (entry.degree || entry.institution || entry.year) &&
              !(isEducationFragment(entry.degree) && !entry.institution) &&
              !(isEducationFragment(entry.institution) && !entry.degree && !entry.year),
          )
          .slice(0, 10)
      : base.education,
  };
}

export function mergeParsedResumeData(
  primaryValue: unknown,
  fallbackValue: unknown,
): ParsedResumeData {
  const primary = normalizeParsedResumeData(primaryValue);
  const fallback = normalizeParsedResumeData(fallbackValue);

  return {
    personalInfo: {
      name: primary.personalInfo.name || fallback.personalInfo.name,
      title: primary.personalInfo.title || fallback.personalInfo.title,
      email: primary.personalInfo.email || fallback.personalInfo.email,
      phone: primary.personalInfo.phone || fallback.personalInfo.phone,
      location: primary.personalInfo.location || fallback.personalInfo.location,
      links: mergeUniqueProfileLinks(
        primary.personalInfo.links,
        fallback.personalInfo.links,
      ),
    },
    summary:
      primary.summary && fallback.summary
        ? pickPreferredText(primary.summary, fallback.summary)
        : primary.summary || fallback.summary,
    skills: mergeUniqueStrings(primary.skills, fallback.skills, 200),
    experience: mergeExperienceArrays(primary.experience, fallback.experience),
    education: mergeEducationArrays(primary.education, fallback.education),
  };
}

export function normalizeAnalysisReport(value: unknown): ResumeAnalysisReport {
  const record = normalizeRecord(value);
  const sectionCompleteness = normalizeRecord(record.sectionCompleteness);

  return {
    score: clampScore(record.score),
    missingKeywords: normalizeStringArray(record.missingKeywords),
    tips: normalizeStringArray(record.tips).slice(0, 8),
    sectionCompleteness: {
      personalInfo: Boolean(sectionCompleteness.personalInfo),
      summary: Boolean(sectionCompleteness.summary),
      skills: Boolean(sectionCompleteness.skills),
      experience: Boolean(sectionCompleteness.experience),
      education: Boolean(sectionCompleteness.education),
    },
    readabilityScore: clampScore(record.readabilityScore),
  };
}

export function normalizeResumeExtractionMeta(value: unknown): ResumeExtractionMeta {
  const base = createEmptyResumeExtractionMeta();
  const record = normalizeRecord(value);
  const sections = normalizeRecord(record.sections);

  return {
    rawTextAvailable: Boolean(record.rawTextAvailable),
    sections: {
      personalInfo: normalizeResumeSectionExtractionMeta(
        sections.personalInfo,
        base.sections.personalInfo,
      ),
      summary: normalizeResumeSectionExtractionMeta(
        sections.summary,
        base.sections.summary,
      ),
      skills: normalizeResumeSectionExtractionMeta(
        sections.skills,
        base.sections.skills,
      ),
      experience: normalizeResumeSectionExtractionMeta(
        sections.experience,
        base.sections.experience,
      ),
      education: normalizeResumeSectionExtractionMeta(
        sections.education,
        base.sections.education,
      ),
    },
  };
}

function normalizeResumeSectionExtractionMeta(
  value: unknown,
  fallback: ResumeSectionExtractionMeta,
): ResumeSectionExtractionMeta {
  const record = normalizeRecord(value);
  const source = normalizeString(record.source).toLowerCase();

  return {
    source:
      source === "local" || source === "ai" || source === "merged"
        ? source
        : fallback.source,
    confidence: clampScore(record.confidence),
    updatedAt: record.updatedAt
      ? new Date(record.updatedAt as string | Date).toISOString()
      : null,
    issues: normalizeStringArray(record.issues, 20),
  };
}

export function toSafeResume(resume: ResumeLike): SafeResume {
  return {
    id: resume._id.toString(),
    fileName: resume.fileName,
    originalUrl: resume.originalUrl ?? null,
    parsedData: normalizeParsedResumeData(resume.parsedData),
    analysisReport: normalizeAnalysisReport(resume.analysisReport),
    createdAt: resume.createdAt ? new Date(resume.createdAt).toISOString() : null,
  };
}
