import { isTechnicalSkill } from "@/lib/technical-skills";

export type GroupedResumeSkills = {
  label: string;
  skills: string[];
};

const SKILL_GROUPS = [
  {
    label: "Languages",
    pattern:
      /\b(?:javascript|typescript|python|java|solidity|sql|nosql|bash|shell|go|golang|rust|c\+\+|c#|php|ruby|swift|kotlin)\b/i,
  },
  {
    label: "Frontend",
    pattern:
      /\b(?:react(?:\.js)?|next(?:\.js)?|vue(?:\.js)?|tailwind|html5|css3|html|css|websockets?|vite|webpack|redux|zustand|storybook|angular)\b/i,
  },
  {
    label: "Backend",
    pattern:
      /\b(?:node(?:\.js)?|express(?:\.js)?|fastify|nestjs|django|fastapi|flask|spring|rest|graphql|grpc|websockets?|microservices)\b/i,
  },
  {
    label: "Blockchain",
    pattern:
      /\b(?:ethereum|evm|smart\s+contracts?|solidity|defi|hardhat|foundry|ethers(?:\.js)?|wagmi|graph|arbitrum|base|ipfs|erc-\d+|web3|blockchain)\b/i,
  },
  {
    label: "AI & ML",
    pattern:
      /\b(?:llm|ai\s+agents?|rag|langchain|langgraph|llamaindex|machine\s+learning|deep\s+learning|ml|nlp|openai|anthropic|hugging\s+face|pinecone|weaviate|chroma|vector)\b/i,
  },
  {
    label: "Databases",
    pattern:
      /\b(?:postgresql|postgres|mysql|mongo(?:db)?|redis|elasticsearch|dynamodb|supabase|prisma|typeorm|sqlalchemy|sqlite)\b/i,
  },
  {
    label: "Data Engineering",
    pattern:
      /\b(?:apache\s+spark|spark|kafka|airflow|dbt|snowflake|etl|data\s+modeling|data\s+engineering|warehouse|pipelines?)\b/i,
  },
  {
    label: "DevOps & Infra",
    pattern:
      /\b(?:aws|gcp|azure|docker|kubernetes|terraform|helm|github\s+actions|gitlab\s+ci|lambda|s3|rds|cloudfront|linux|nginx|prometheus|grafana|elk\s+stack|devops)\b/i,
  },
];

export function stripSkillGroupPrefix(skill: string) {
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

function appendSkill(group: GroupedResumeSkills, skill: string) {
  if (
    skill &&
    !group.skills.some((existingSkill) => existingSkill.toLowerCase() === skill.toLowerCase())
  ) {
    group.skills.push(skill);
  }
}

export function groupResumeSkills(skills: string[], limitPerGroup = 18) {
  const explicitGroups: GroupedResumeSkills[] = [];
  const inferredGroups = SKILL_GROUPS.map((group) => ({
    label: group.label,
    pattern: group.pattern,
    skills: [] as string[],
  }));
  const additional: GroupedResumeSkills & { pattern: RegExp } = {
    label: "Additional",
    pattern: /$a/,
    skills: [],
  };

  for (const rawSkill of skills) {
    const { group, skill } = stripSkillGroupPrefix(rawSkill);

    if (!skill || !isTechnicalSkill(skill)) continue;

    if (group) {
      let target = explicitGroups.find(
        (candidate) => candidate.label.toLowerCase() === group.toLowerCase(),
      );

      if (!target) {
        target = { label: group, skills: [] };
        explicitGroups.push(target);
      }

      appendSkill(target, skill);
      continue;
    }

    const target =
      inferredGroups.find((candidate) => candidate.pattern.test(skill)) ?? additional;
    appendSkill(target, skill);
  }

  const groups = explicitGroups.length
    ? explicitGroups
    : [...inferredGroups, additional];

  return groups
    .map((group) => ({
      label: group.label,
      skills: group.skills.slice(0, limitPerGroup),
    }))
    .filter((group) => group.skills.length);
}
