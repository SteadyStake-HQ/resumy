import { Types } from "@/lib/id";
import { sanitizeTechnicalSkills } from "@/lib/technical-skills";

const KEYWORD_STOP_WORDS = new Set([
  "about",
  "after",
  "all",
  "also",
  "and",
  "are",
  "because",
  "been",
  "being",
  "build",
  "candidate",
  "company",
  "experience",
  "from",
  "have",
  "ideal",
  "into",
  "join",
  "looking",
  "must",
  "need",
  "our",
  "role",
  "team",
  "that",
  "their",
  "they",
  "this",
  "through",
  "with",
  "will",
  "your",
  "contract",
  "details",
  "remote",
  "based",
  "initial",
  "extension",
  "potential",
  "fully",
  "european",
  "daily",
  "day",
  "rate",
  "per",
  "what",
  "doing",
  "including",
  "using",
  "solutions",
  "modern",
  "scalable",
  "experienced",
  "ready",
  "deploy",
  "deployment",
  "deploying",
  "data",
]);

const TECH_SKILL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "React", pattern: /\breact(?:\.js|js)?\b/i },
  { label: "React Hooks", pattern: /\breact\s+hooks?\b|\bhooks?\b/i },
  { label: "Redux", pattern: /\bredux\b/i },
  { label: "Zustand", pattern: /\bzustand\b/i },
  { label: "React Query", pattern: /\breact query\b/i },
  { label: "JavaScript", pattern: /\bjavascript\b|\bjs\b/i },
  { label: "TypeScript", pattern: /\btypescript\b|\bts\b/i },
  { label: "REST APIs", pattern: /\brest(?:ful)?\s+apis?\b|\bconsume\s+rest\b|\bapi integration\b/i },
  { label: "React Native", pattern: /\breact native\b|\brn\b/i },
  { label: "Java", pattern: /\bjava\b(?!script)/i },
  { label: "Spring Boot", pattern: /\bspring boot\b|\bspring\b/i },
  { label: "RESTful Services", pattern: /\brestful services?\b|\brest services?\b/i },
  { label: "Python", pattern: /\bpython\b/i },
  { label: "Snowflake", pattern: /\bsnowflake\b/i },
  { label: "Snowpark", pattern: /\bsnowpark\b/i },
  { label: "SQL", pattern: /\bsql\b/i },
  { label: "Snowflake Streams", pattern: /\bstreams?\b/i },
  { label: "Snowflake Tasks", pattern: /\btasks?\b/i },
  { label: "Snowpipe", pattern: /\bsnowpipe\b/i },
  { label: "scikit-learn", pattern: /\bscikit[-\s]?learn\b/i },
  { label: "XGBoost", pattern: /\bxgboost\b/i },
  { label: "LightGBM", pattern: /\blightgbm\b/i },
  { label: "Data Pipelines", pattern: /\bdata pipelines?\b|\bingestion pipelines?\b/i },
  { label: "Azure Data Lake", pattern: /\bazure data lake\b/i },
  { label: "Microsoft Fabric", pattern: /\bmicrosoft fabric\b|\bfabric\b/i },
];

const SOFT_SKILL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Agile/Scrum", pattern: /\bagile\b|\bscrum\b|\bsprint planning\b|\bagile ceremonies\b/i },
  { label: "Code Reviews", pattern: /\bcode reviews?\b/i },
  { label: "Product Enhancements", pattern: /\bproduct enhancements?\b|\bfeature improvements?\b|\bbacklog features?\b/i },
  { label: "Production Issue Resolution", pattern: /\bproduction issues?\b|\broot[-\s]?cause\b/i },
  { label: "Cross-functional Collaboration", pattern: /\bcross[-\s]?functional\b|\bproduct managers?\b|\bux designers?\b|\bbackend engineers?\b/i },
  { label: "End-to-End Ownership", pattern: /\bend[-\s]?to[-\s]?end\b|\bown\b/i },
  { label: "Reliability", pattern: /\breliability\b|\breliable\b/i },
  { label: "Scalability", pattern: /\bscalability\b|\bscalable\b/i },
  { label: "Monitoring", pattern: /\bmonitor(?:ing)?\b/i },
  { label: "Production Readiness", pattern: /\bproduction[-\s]?ready\b|\bproduction\b/i },
];

function appendUniqueSkill(target: string[], skill: string) {
  if (!target.some((entry) => entry.toLowerCase() === skill.toLowerCase())) {
    target.push(skill);
  }
}

export function extractJobSkillSignals(text: string, limit = 40) {
  const skills: string[] = [];

  for (const skill of TECH_SKILL_PATTERNS) {
    if (skill.pattern.test(text)) {
      appendUniqueSkill(skills, skill.label);
    }
  }

  return sanitizeTechnicalSkills(skills).map((skill) => skill.replace(/^[^:]+:\s*/, "")).slice(0, limit);
}

export function extractJobProcessSignals(text: string, limit = 12) {
  const skills: string[] = [];

  for (const skill of SOFT_SKILL_PATTERNS) {
    if (skill.pattern.test(text)) {
      appendUniqueSkill(skills, skill.label);
    }
  }

  return skills.slice(0, limit);
}

type JobDescriptionLike = {
  _id: Types.ObjectId | string;
  title?: string | null;
  company?: string | null;
  content: string;
  parsedKeywords?: unknown;
  createdAt?: Date | string | null;
};

export type SafeJobDescription = {
  id: string;
  title: string;
  company: string;
  content: string;
  parsedKeywords: string[];
  createdAt: string | null;
};

export type ParsedJobDescriptionSummary = {
  roleTitle: string;
  companyName: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  keywords: string[];
  seniorityLevel: string;
  industrySignals: string[];
};

export type JobTechnicalEnvironment = {
  languages: string[];
  frameworks: string[];
  cloud: string[];
  databases: string[];
  infrastructure: string[];
  tools: string[];
  methodologies: string[];
};

export type JobDomainAnalysis = {
  industryDomain: string;
  domainComplexity: string;
  regulatorySignals: string[];
  safetyCriticalSignals: string[];
  engineeringMaturity: string;
};

export type JobAtsAnalysis = {
  atsKeywords: string[];
  priorityKeywords: string[];
  aboveTheFoldPriorities: string[];
  resumeBulletKeywords: string[];
  recruiterScanTerms: string[];
};

export type JobCultureAnalysis = {
  ownershipLevel: string;
  communicationStyle: string;
  executionPace: string;
  autonomyExpectation: string;
  growthMindsetExpectation: string;
  ambiguityTolerance: string;
};

export type JobResumeTailoringGuidance = {
  emphasizeExperience: string[];
  emphasizeAchievements: string[];
  preferredResumeTone: string;
  recommendedBulletStyle: string;
  deprioritize: string[];
};

export type AnalyzedJobDescription = ParsedJobDescriptionSummary & {
  department: string;
  roleType: string;
  employmentType: string;
  industry: string;
  companyStage: string;
  companySignals: string[];
  technicalEnvironment: string[];
  technicalEnvironmentDetails: JobTechnicalEnvironment;
  dataAndMlSkills: string[];
  platformsAndTools: string[];
  coreResponsibilities: string[];
  inferredSkills: string[];
  technicalSkills: string[];
  softSkills: string[];
  operationalSkills: string[];
  leadershipSignals: string[];
  executionSignals: string[];
  collaborationSignals: string[];
  keywordPriorities: string[];
  /** Exact ATS-filter phrases the resume must contain (e.g. "distributed systems", "CI/CD pipelines") */
  atsKeywords: string[];
  /** Top 3-5 skills/themes that must appear "above the fold" (summary + first role) */
  aboveTheFoldPriorities: string[];
  /** 1-2 sentence description of the core business problem this hire is expected to solve */
  coreHiringProblem: string;
  mission: string;
  /** Company type signal inferred from context (startup / scaleup / enterprise / consultancy) */
  companySignal: string;
  domainAnalysis: JobDomainAnalysis;
  atsAnalysis: JobAtsAnalysis;
  cultureAnalysis: JobCultureAnalysis;
  resumeTailoringGuidance: JobResumeTailoringGuidance;
  nonSkillTermsIgnored: string[];
  tailoringGuidance: string[];
  warnings: string[];
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown, limit = 60) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .slice(0, limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function emptyTechnicalEnvironment(): JobTechnicalEnvironment {
  return {
    languages: [],
    frameworks: [],
    cloud: [],
    databases: [],
    infrastructure: [],
    tools: [],
    methodologies: [],
  };
}

function normalizeTechnicalEnvironment(value: unknown): JobTechnicalEnvironment {
  const record = isRecord(value) ? value : {};

  return {
    languages: normalizeStringArray(record.languages),
    frameworks: normalizeStringArray(record.frameworks),
    cloud: normalizeStringArray(record.cloud),
    databases: normalizeStringArray(record.databases),
    infrastructure: normalizeStringArray(record.infrastructure),
    tools: normalizeStringArray(record.tools),
    methodologies: normalizeStringArray(record.methodologies),
  };
}

function flattenTechnicalEnvironment(environment: JobTechnicalEnvironment) {
  return [
    ...environment.languages,
    ...environment.frameworks,
    ...environment.cloud,
    ...environment.databases,
    ...environment.infrastructure,
    ...environment.tools,
    ...environment.methodologies,
  ].filter(
    (item, index, items) =>
      items.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index,
  );
}

function normalizeDomainAnalysis(value: unknown): JobDomainAnalysis {
  const record = isRecord(value) ? value : {};

  return {
    industryDomain: normalizeString(record.industryDomain),
    domainComplexity: normalizeString(record.domainComplexity),
    regulatorySignals: normalizeStringArray(record.regulatorySignals),
    safetyCriticalSignals: normalizeStringArray(record.safetyCriticalSignals),
    engineeringMaturity: normalizeString(record.engineeringMaturity),
  };
}

function normalizeAtsAnalysis(value: unknown): JobAtsAnalysis {
  const record = isRecord(value) ? value : {};

  return {
    atsKeywords: normalizeStringArray(record.atsKeywords),
    priorityKeywords: normalizeStringArray(record.priorityKeywords),
    aboveTheFoldPriorities: normalizeStringArray(record.aboveTheFoldPriorities),
    resumeBulletKeywords: normalizeStringArray(record.resumeBulletKeywords),
    recruiterScanTerms: normalizeStringArray(record.recruiterScanTerms),
  };
}

function normalizeCultureAnalysis(value: unknown): JobCultureAnalysis {
  const record = isRecord(value) ? value : {};

  return {
    ownershipLevel: normalizeString(record.ownershipLevel),
    communicationStyle: normalizeString(record.communicationStyle),
    executionPace: normalizeString(record.executionPace),
    autonomyExpectation: normalizeString(record.autonomyExpectation),
    growthMindsetExpectation: normalizeString(record.growthMindsetExpectation),
    ambiguityTolerance: normalizeString(record.ambiguityTolerance),
  };
}

function normalizeResumeTailoringGuidance(value: unknown): JobResumeTailoringGuidance {
  const record = isRecord(value) ? value : {};

  return {
    emphasizeExperience: normalizeStringArray(record.emphasizeExperience),
    emphasizeAchievements: normalizeStringArray(record.emphasizeAchievements),
    preferredResumeTone: normalizeString(record.preferredResumeTone),
    recommendedBulletStyle: normalizeString(record.recommendedBulletStyle),
    deprioritize: normalizeStringArray(record.deprioritize),
  };
}

export function extractKeywordCandidates(text: string, limit = 12) {
  const skillSignals = extractJobSkillSignals(text, limit);
  const processSignals = extractJobProcessSignals(text, Math.max(0, limit - skillSignals.length));
  const prioritizedSignals = [...skillSignals, ...processSignals];

  if (prioritizedSignals.length >= limit) {
    return prioritizedSignals.slice(0, limit);
  }

  const counts = new Map<string, number>();
  const matches =
    text
      .toLowerCase()
      .match(/[a-z0-9+#/.:-]{3,}/g)
      ?.map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9+#/.:-]+$/g, ""))
      .filter(Boolean) ?? [];

  for (const token of matches) {
    if (
      token.length < 3 ||
      KEYWORD_STOP_WORDS.has(token) ||
      /^\d/.test(token) ||
      /^(?:€|\$)?\d/.test(token)
    ) {
      continue;
    }

    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([keyword]) => keyword)
    .filter(
      (keyword) =>
        !prioritizedSignals.some(
          (signal) => signal.toLowerCase() === keyword.toLowerCase(),
        ),
    )
    .slice(0, Math.max(0, limit - prioritizedSignals.length))
    .reduce((keywords, keyword) => {
      appendUniqueSkill(keywords, keyword);
      return keywords;
    }, prioritizedSignals.slice());
}

export function extractPriorityJobPhrases(text: string, limit = 80) {
  const normalizedText = normalizeString(text);
  const phrases: string[] = [];

  const add = (phrase: string) => appendUniqueSkill(phrases, phrase);

  for (const skill of extractJobSkillSignals(normalizedText, 60)) {
    add(skill);
  }
  for (const skill of extractJobProcessSignals(normalizedText, 24)) {
    add(skill);
  }

  const explicitPhrasePatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: "React hooks", pattern: /\breact\s+hooks?\b/i },
    { label: "State management", pattern: /\bstate management\b/i },
    { label: "Component architecture", pattern: /\bcomponent architecture\b/i },
    { label: "Modern frontend architectures", pattern: /\bmodern frontend architectures?\b/i },
    { label: "REST APIs", pattern: /\bREST APIs?\b/i },
    { label: "Async data flows", pattern: /\basync(?:hronous)? data flows?\b/i },
    { label: "Frontend debugging", pattern: /\bfrontend debugging\b|\bfront-end debugging\b/i },
    { label: "Performance optimization", pattern: /\bperformance optimization\b/i },
    { label: "Root-cause resolution", pattern: /\broot[-\s]?cause resolution\b/i },
    { label: "Legacy code refactoring", pattern: /\blegacy code\b|\brefactor legacy code\b/i },
    { label: "API integration", pattern: /\bAPI integration\b/i },
    { label: "Service updates", pattern: /\bservice updates?\b/i },
    { label: "Sprint planning", pattern: /\bsprint planning\b/i },
    { label: "Agile ceremonies", pattern: /\bAgile ceremonies\b/i },
  ];

  for (const phrase of explicitPhrasePatterns) {
    if (phrase.pattern.test(normalizedText)) {
      add(phrase.label);
    }
  }

  return phrases.slice(0, limit);
}

function extractLinesMatching(text: string, patterns: RegExp[], limit: number) {
  return text
    .split(/\r?\n+/)
    .map((line) => normalizeString(line.replace(/^[-*•\d.)\s]+/, "")))
    .filter((line) => line && patterns.some((pattern) => pattern.test(line)))
    .slice(0, limit);
}

function inferSeniority(text: string) {
  if (/\b(principal|staff|lead|head of|director)\b/i.test(text)) return "lead";
  if (/\b(senior|sr\.?)\b/i.test(text)) return "senior";
  if (/\b(junior|jr\.?|entry level|graduate|intern)\b/i.test(text)) return "junior";
  if (/\b(engineering manager|manager|people management|team management)\b/i.test(text)) {
    return "manager";
  }
  return "";
}

export function parseJobDescriptionSummary(
  text: string,
  input: { title?: string; company?: string } = {},
): ParsedJobDescriptionSummary {
  const normalizedText = normalizeString(text);
  const firstMeaningfulLine =
    normalizedText
      .split(/\r?\n+/)
      .map((line) => normalizeString(line))
      .find((line) =>
        line.length >= 4 &&
        line.length <= 90 &&
        !/^(?:job description|description|key responsibilities|responsibilities|required qualifications|qualifications)$/i.test(line) &&
        !/^(?:build|support|contribute|work on|debug|refactor|collaborate|participate|frontend|backend|mobile|required|preferred|solid|strong|experience|familiarity|comfort|ability|understanding|exposure)\b/i.test(line)
      ) ?? "";

  const keywords = extractPriorityJobPhrases(normalizedText, 40);
  const technicalSkills = extractJobSkillSignals(normalizedText, 32);
  const processSkills = extractJobProcessSignals(normalizedText, 12);
  return {
    roleTitle: normalizeString(input.title) || firstMeaningfulLine,
    companyName: normalizeString(input.company),
    requiredSkills: [...technicalSkills, ...processSkills].slice(0, 32),
    preferredSkills: extractLinesMatching(normalizedText, [
      /\b(preferred|nice to have|bonus|plus|familiarity|desirable)\b/i,
      /azure data lake|microsoft fabric|time[-\s]?series/i,
    ], 12),
    responsibilities: extractLinesMatching(normalizedText, [
      /\b(responsib|you will|own|build|design|develop|lead|manage|collaborate|deliver)\b/i,
    ], 16),
    keywords,
    seniorityLevel: inferSeniority(normalizedText),
    industrySignals: keywords.filter((keyword) =>
      /fintech|health|healthcare|retail|saas|education|commerce|crypto|web3|security|data|ai|cloud/i.test(keyword),
    ),
  };
}

export function normalizeAnalyzedJobDescription(
  value: Partial<AnalyzedJobDescription> | Record<string, unknown> | null | undefined,
  fallbackText = "",
  input: { title?: string; company?: string } = {},
): AnalyzedJobDescription {
  const fallback = parseJobDescriptionSummary(fallbackText, input);
  const source = isRecord(value) ? value : {};
  const technicalEnvironmentDetails = normalizeTechnicalEnvironment(
    source.technicalEnvironment,
  );
  const flattenedTechnicalEnvironment = Array.isArray(source.technicalEnvironment)
    ? normalizeStringArray(source.technicalEnvironment)
    : flattenTechnicalEnvironment(technicalEnvironmentDetails);
  const domainAnalysis = normalizeDomainAnalysis(source.domainAnalysis);
  const atsAnalysis = normalizeAtsAnalysis(source.atsAnalysis);
  const cultureAnalysis = normalizeCultureAnalysis(source.cultureAnalysis);
  const resumeTailoringGuidance = normalizeResumeTailoringGuidance(
    source.resumeTailoringGuidance,
  );
  const requiredSkills = normalizeStringArray(source.requiredSkills).length
    ? normalizeStringArray(source.requiredSkills)
    : fallback.requiredSkills;
  const preferredSkills = normalizeStringArray(source.preferredSkills).length
    ? normalizeStringArray(source.preferredSkills)
    : fallback.preferredSkills;
  const responsibilities = normalizeStringArray(source.responsibilities).length
    ? normalizeStringArray(source.responsibilities)
    : fallback.responsibilities;
  const keywordPriorities = normalizeStringArray(source.keywordPriorities).length
    ? normalizeStringArray(source.keywordPriorities)
    : atsAnalysis.priorityKeywords.length
      ? atsAnalysis.priorityKeywords
    : fallback.keywords;
  const atsKeywords = normalizeStringArray(source.atsKeywords).length
    ? normalizeStringArray(source.atsKeywords)
    : atsAnalysis.atsKeywords.length
      ? atsAnalysis.atsKeywords
      : keywordPriorities.slice(0, 10);
  const aboveTheFoldPriorities =
    normalizeStringArray(source.aboveTheFoldPriorities).length
      ? normalizeStringArray(source.aboveTheFoldPriorities)
      : atsAnalysis.aboveTheFoldPriorities.length
        ? atsAnalysis.aboveTheFoldPriorities
        : requiredSkills.slice(0, 5);
  const tailoringGuidance = normalizeStringArray(source.tailoringGuidance).length
    ? normalizeStringArray(source.tailoringGuidance)
    : [
        ...resumeTailoringGuidance.emphasizeExperience,
        ...resumeTailoringGuidance.emphasizeAchievements,
        resumeTailoringGuidance.preferredResumeTone,
        resumeTailoringGuidance.recommendedBulletStyle,
        ...resumeTailoringGuidance.deprioritize.map((item) => `Deprioritize ${item}`),
      ].filter(Boolean).slice(0, 12);
  const companySignals = normalizeStringArray(source.companySignals);

  return {
    roleTitle: normalizeString(source.roleTitle) || fallback.roleTitle,
    companyName: normalizeString(source.companyName) || fallback.companyName,
    department: normalizeString(source.department),
    requiredSkills,
    preferredSkills,
    responsibilities,
    keywords: normalizeStringArray(source.keywords).length
      ? normalizeStringArray(source.keywords)
      : keywordPriorities,
    seniorityLevel: normalizeString(source.seniorityLevel) || fallback.seniorityLevel,
    industrySignals: normalizeStringArray(source.industrySignals).length
      ? normalizeStringArray(source.industrySignals)
      : [
          domainAnalysis.industryDomain,
          normalizeString(source.industry),
          ...fallback.industrySignals,
        ].filter(Boolean),
    roleType: normalizeString(source.roleType),
    employmentType: normalizeString(source.employmentType),
    industry: normalizeString(source.industry),
    companyStage: normalizeString(source.companyStage),
    companySignals,
    technicalEnvironment: flattenedTechnicalEnvironment,
    technicalEnvironmentDetails: Array.isArray(source.technicalEnvironment)
      ? emptyTechnicalEnvironment()
      : technicalEnvironmentDetails,
    dataAndMlSkills: normalizeStringArray(source.dataAndMlSkills).length
      ? normalizeStringArray(source.dataAndMlSkills)
      : [
          ...technicalEnvironmentDetails.tools,
          ...technicalEnvironmentDetails.methodologies,
        ].filter((item) => /\b(?:ai|ml|machine learning|data|analytics|model|llm|rag)\b/i.test(item)),
    platformsAndTools: normalizeStringArray(source.platformsAndTools).length
      ? normalizeStringArray(source.platformsAndTools)
      : [
          ...technicalEnvironmentDetails.cloud,
          ...technicalEnvironmentDetails.infrastructure,
          ...technicalEnvironmentDetails.tools,
        ],
    coreResponsibilities: normalizeStringArray(source.coreResponsibilities).length
      ? normalizeStringArray(source.coreResponsibilities)
      : responsibilities,
    inferredSkills: normalizeStringArray(source.inferredSkills),
    technicalSkills: normalizeStringArray(source.technicalSkills),
    softSkills: normalizeStringArray(source.softSkills),
    operationalSkills: normalizeStringArray(source.operationalSkills),
    leadershipSignals: normalizeStringArray(source.leadershipSignals),
    executionSignals: normalizeStringArray(source.executionSignals),
    collaborationSignals: normalizeStringArray(source.collaborationSignals),
    keywordPriorities,
    atsKeywords,
    aboveTheFoldPriorities,
    coreHiringProblem: normalizeString(source.coreHiringProblem),
    mission: normalizeString(source.mission),
    companySignal:
      normalizeString(source.companySignal) ||
      normalizeString(source.companyStage) ||
      companySignals[0] ||
      "",
    domainAnalysis,
    atsAnalysis: {
      ...atsAnalysis,
      atsKeywords,
      priorityKeywords: atsAnalysis.priorityKeywords.length
        ? atsAnalysis.priorityKeywords
        : keywordPriorities,
      aboveTheFoldPriorities,
    },
    cultureAnalysis,
    resumeTailoringGuidance,
    nonSkillTermsIgnored: normalizeStringArray(source.nonSkillTermsIgnored),
    tailoringGuidance,
    warnings: normalizeStringArray(source.warnings),
  };
}

export function toSafeJobDescription(
  jobDescription: JobDescriptionLike,
): SafeJobDescription {
  return {
    id: jobDescription._id.toString(),
    title: normalizeString(jobDescription.title),
    company: normalizeString(jobDescription.company),
    content: normalizeString(jobDescription.content),
    parsedKeywords: normalizeStringArray(jobDescription.parsedKeywords),
    createdAt: jobDescription.createdAt
      ? new Date(jobDescription.createdAt).toISOString()
      : null,
  };
}
