export const MAX_TECHNICAL_SKILL_GROUPS = 7;
export const MAX_TECHNICAL_SKILLS_PER_GROUP = 12;

const BLOCKED_GROUP_LABELS = new Set([
  "additional",
  "additional skills",
  "architecture",
  "general",
  "general skills",
  "leadership",
  "leadership skills",
  "methodologies",
  "misc",
  "miscellaneous",
  "other",
  "other skills",
  "professional skills",
  "soft skills",
  "technical skills",
  "various",
]);

const BLOCKED_SKILL_KEYS = new Set([
  "agile",
  "agile scrum",
  "analytical skills",
  "analytical thinking",
  "application development",
  "attention to detail",
  "backend development",
  "back end development",
  "best practice",
  "best practices",
  "build",
  "clean code",
  "code quality",
  "code review",
  "code reviews",
  "coding",
  "collaboration",
  "communication",
  "cross functional collaboration",
  "debug",
  "debugging",
  "decision making",
  "delivery",
  "design",
  "documentation",
  "end to end ownership",
  "engineer",
  "engineering",
  "expertise",
  "feature engineering",
  "frontend debugging",
  "front end development",
  "frontend development",
  "full stack development",
  "functional programming",
  "leadership",
  "machine learning",
  "management",
  "mentoring",
  "methodology",
  "mobile experiences",
  "object oriented",
  "object oriented programming",
  "oop",
  "ownership",
  "peer review",
  "performance",
  "performance optimization",
  "problem solving",
  "programming",
  "quality",
  "refactor",
  "refactoring",
  "reliability",
  "research",
  "scalability",
  "scalable systems",
  "scrum",
  "software",
  "software development",
  "source control",
  "source code management",
  "teamwork",
  "technical documentation",
  "technical writing",
  "test automation",
  "testing",
  "time management",
  "unit testing",
  "version control",
  "web development",
]);

const BLOCKED_SKILL_PATTERNS: RegExp[] = [
  /\b\d+\+?\s*years?\b/i,
  /\byears?\s+(?:of\s+)?(?:experience|expertise)\b/i,
  /\b(?:developer|engineer|senior|junior|lead|principal|staff|architect|manager|intern|specialist|consultant|analyst|programmer|designer|scientist|researcher|professional)\b/i,
  /\b(?:cross[-\s]?functional|ownership|time management|communication|teamwork|leadership|mentoring)\b/i,
  /\b(?:code reviews?|peer reviews?|refactoring|debugging|root[-\s]?cause|sprint planning|agile ceremonies)\b/i,
];

const TECHNICAL_SKILL_PATTERNS: RegExp[] = [
  /\b(?:javascript|typescript|python|java(?!script)|c#|c\+\+|go|golang|rust|php|ruby|swift|kotlin|sql|bash|shell|solidity|scala|r)\b/i,
  /\b(?:react(?:\.js)?|react native|next(?:\.js)?|vue(?:\.js)?|angular|svelte|redux|zustand|react query|tailwind(?: css)?|webpack|vite|storybook|framer motion|styled components|html5?|css3?|sass|scss|jquery)\b/i,
  /\b(?:node(?:\.js)?|express(?:\.js)?|nestjs?|fastify|django|fastapi|flask|spring boot|spring|rails|laravel|graphql|rest(?:ful)?(?: apis?| services?)?|grpc|trpc|websockets?|microservices|rabbitmq|kafka)\b/i,
  /\b(?:postgresql|postgres|mysql|sqlite|mongodb|mongo|redis|elasticsearch|dynamodb|cassandra|bigquery|snowflake|supabase|prisma|typeorm|sqlalchemy)\b/i,
  /\b(?:aws|gcp|google cloud|azure|docker|kubernetes|terraform|helm|pulumi|nginx|linux|github actions|gitlab ci|jenkins|argo ?cd|cloud run|lambda|s3|rds|cloudfront)\b/i,
  /\b(?:jest|vitest|pytest|playwright|cypress|react testing library|k6|postman|swagger|openapi)\b/i,
  /\b(?:openai|anthropic|langchain|llamaindex|rag|llm|hugging face|pinecone|weaviate|chroma|tensorflow|pytorch|scikit[-\s]?learn|xgboost|lightgbm|pandas|numpy|spark|airflow|dbt|snowpark|snowpipe)\b/i,
  /\b(?:ethereum|evm|hardhat|foundry|ethers(?:\.js)?|wagmi|viem|openzeppelin|ipfs|defi|web3|erc[-\s]?\d+)\b/i,
  /\b(?:datadog|grafana|prometheus|sentry|elk stack)\b/i,
];

const GROUP_ALIASES: Record<string, string> = {
  "ai": "AI & ML",
  "ai and ml": "AI & ML",
  "ai & ml": "AI & ML",
  "backend": "Backend",
  "backend services": "Backend",
  "blockchain": "Blockchain & Web3",
  "blockchain and web3": "Blockchain & Web3",
  "blockchain & web3": "Blockchain & Web3",
  "ci/cd": "CI/CD & Tooling",
  "ci/cd & tooling": "CI/CD & Tooling",
  "cloud": "DevOps & Cloud",
  "cloud and devops": "DevOps & Cloud",
  "cloud & devops": "DevOps & Cloud",
  "data": "Data Engineering",
  "devops": "DevOps & Cloud",
  "devops & cloud": "DevOps & Cloud",
  "devops & infra": "DevOps & Cloud",
  "frontend": "Frontend",
  "front end": "Frontend",
  "mobile": "Mobile",
};

const GROUP_ORDER = [
  "Frontend",
  "Languages",
  "Backend",
  "Mobile",
  "Databases",
  "DevOps & Cloud",
  "CI/CD & Tooling",
  "Testing",
  "AI & ML",
  "Data Engineering",
  "Blockchain & Web3",
  "Monitoring",
  "Security",
  "CMS & Frameworks",
];

function stripSkillGroupPrefix(skill: string) {
  const normalizedSkill = skill.trim();
  const match = normalizedSkill.match(/^([^:]{2,56}):\s*(.+)$/);

  if (!match) {
    return {
      group: "",
      skill: normalizedSkill,
    };
  }

  return {
    group: match[1].trim(),
    skill: match[2].trim(),
  };
}

export type TechnicalSkillGroup = {
  label: string;
  skills: string[];
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLabel(label: string) {
  const normalized = label.replace(/\s+/g, " ").trim();
  return GROUP_ALIASES[normalizeKey(normalized)] ?? normalized;
}

function splitSkillText(value: string) {
  return value
    .split(/\s*(?:,|;|•|\n)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isBlockedGroup(label: string) {
  return BLOCKED_GROUP_LABELS.has(normalizeKey(label));
}

export function isTechnicalSkill(value: string) {
  const { skill } = stripSkillGroupPrefix(value);
  const normalized = skill.replace(/\s+/g, " ").trim();
  const key = normalizeKey(normalized);

  if (!normalized || normalized.length < 2) return false;
  if (BLOCKED_SKILL_KEYS.has(key)) return false;
  if (BLOCKED_SKILL_PATTERNS.some((pattern) => pattern.test(normalized))) return false;

  return TECHNICAL_SKILL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function appendSkill(
  groups: TechnicalSkillGroup[],
  groupLabel: string,
  skill: string,
  seen: Set<string>,
) {
  const normalizedSkill = skill.replace(/\s+/g, " ").trim();
  const key = normalizeKey(normalizedSkill);
  if (!isTechnicalSkill(normalizedSkill) || seen.has(key)) return;

  const label = normalizeLabel(groupLabel);
  if (!label || isBlockedGroup(label)) return;

  let group = groups.find((candidate) => candidate.label.toLowerCase() === label.toLowerCase());
  if (!group) {
    group = { label, skills: [] };
    groups.push(group);
  }

  if (group.skills.length >= MAX_TECHNICAL_SKILLS_PER_GROUP) return;
  group.skills.push(normalizedSkill);
  seen.add(key);
}

export function sanitizeTechnicalSkillGroups(
  value: unknown,
  options: {
    maxGroups?: number;
    maxItemsPerGroup?: number;
  } = {},
) {
  const maxGroups = options.maxGroups ?? MAX_TECHNICAL_SKILL_GROUPS;
  const maxItemsPerGroup = options.maxItemsPerGroup ?? MAX_TECHNICAL_SKILLS_PER_GROUP;
  const groups: TechnicalSkillGroup[] = [];
  const seen = new Set<string>();

  const add = (groupLabel: string, skill: string) => {
    const previousCount = groups.find((group) => group.label === normalizeLabel(groupLabel))?.skills.length ?? 0;
    if (previousCount >= maxItemsPerGroup) return;
    appendSkill(groups, groupLabel, skill, seen);
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        const { group, skill } = stripSkillGroupPrefix(item);
        add(group || classifyTechnicalSkillGroup(skill), skill);
      } else if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const label = normalizeLabel(
          String(record.label ?? record.category ?? record.name ?? record.group ?? ""),
        );
        const rawItems = record.items ?? record.skills ?? record.values ?? record.list;
        const items = Array.isArray(rawItems)
          ? rawItems.map((entry) => String(entry ?? ""))
          : splitSkillText(String(rawItems ?? ""));
        for (const skill of items) add(label || classifyTechnicalSkillGroup(skill), skill);
      }
    }
  } else if (value && typeof value === "object") {
    for (const [label, rawItems] of Object.entries(value as Record<string, unknown>)) {
      const items = Array.isArray(rawItems)
        ? rawItems.map((entry) => String(entry ?? ""))
        : splitSkillText(String(rawItems ?? ""));
      for (const skill of items) add(label, skill);
    }
  }

  return groups
    .filter((group) => group.skills.length)
    .sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.label);
      const bi = GROUP_ORDER.indexOf(b.label);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .slice(0, maxGroups)
    .map((group) => ({
      label: group.label,
      skills: group.skills.slice(0, maxItemsPerGroup),
    }));
}

export function sanitizeTechnicalSkills(value: unknown) {
  return sanitizeTechnicalSkillGroups(value).flatMap((group) =>
    group.skills.map((skill) => `${group.label}: ${skill}`),
  );
}

export function classifyTechnicalSkillGroup(term: string) {
  if (/\b(?:react native|mobile)\b/i.test(term)) return "Mobile";
  if (/\b(?:react|next|vue|angular|javascript|typescript|html|css|tailwind|redux|zustand|frontend|front end|webpack|vite|storybook)\b/i.test(term)) return "Frontend";
  if (/\b(?:java(?!script)|spring|node|express|nestjs|fastify|django|fastapi|flask|api|rest|graphql|grpc|microservices|backend)\b/i.test(term)) return "Backend";
  if (/\b(?:postgres|mysql|sqlite|mongo|redis|elastic|dynamo|cassandra|snowflake|bigquery|supabase|prisma)\b/i.test(term)) return "Databases";
  if (/\b(?:aws|gcp|azure|docker|kubernetes|terraform|helm|github actions|gitlab ci|jenkins|cloud run|devops)\b/i.test(term)) return "DevOps & Cloud";
  if (/\b(?:jest|vitest|pytest|playwright|cypress|testing library|k6|postman|swagger|openapi)\b/i.test(term)) return "Testing";
  if (/\b(?:openai|anthropic|langchain|llamaindex|rag|llm|hugging face|pinecone|weaviate|tensorflow|pytorch|scikit|pandas|numpy)\b/i.test(term)) return "AI & ML";
  if (/\b(?:spark|airflow|dbt|kafka|snowpark|snowpipe|data pipeline|etl)\b/i.test(term)) return "Data Engineering";
  if (/\b(?:ethereum|evm|solidity|hardhat|foundry|web3|ipfs|defi|erc)\b/i.test(term)) return "Blockchain & Web3";
  if (/\b(?:datadog|grafana|prometheus|sentry)\b/i.test(term)) return "Monitoring";
  return "Languages";
}

export function technicalSkillKey(value: string) {
  return normalizeKey(stripSkillGroupPrefix(value).skill);
}

export function reorderTechnicalSkillsByJobPriority(
  skills: string[],
  priorityTerms: string[],
) {
  const priorityKeys = priorityTerms.map(technicalSkillKey).filter(Boolean);
  const groups = sanitizeTechnicalSkillGroups(skills);

  const score = (value: string) => {
    const key = technicalSkillKey(value);
    const index = priorityKeys.findIndex(
      (priorityKey) =>
        key === priorityKey || key.includes(priorityKey) || priorityKey.includes(key),
    );
    return index === -1 ? 0 : 1000 - index * 5;
  };

  return groups
    .map((group, groupIndex) => ({
      ...group,
      groupIndex,
      score: Math.max(score(group.label), ...group.skills.map(score)),
      skills: [...group.skills].sort((left, right) => score(right) - score(left)),
    }))
    .sort((left, right) => right.score - left.score || left.groupIndex - right.groupIndex)
    .flatMap((group) => group.skills.map((skill) => `${group.label}: ${skill}`));
}
