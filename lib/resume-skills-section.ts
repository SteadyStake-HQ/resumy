import { RESUME_STYLE_CONFIG } from "@/lib/resume-style-config";
import { groupResumeSkills, type GroupedResumeSkills } from "@/lib/resume-skills";

// STRICT COPY display limits: generous bounds that prevent runaway layouts
// without silently dropping a resume's real skills or categories.
const MAX_SKILL_GROUPS = 16;
const MAX_SKILLS_PER_GROUP = 40;

export type ResumeSkillGroup = {
  label: string;
  items: string[];
};

const CATEGORY_ORDER = [
  "Languages",
  "Backend",
  "Frontend",
  "Blockchain & Web3",
  "AI & ML",
  "Databases",
  "DevOps & Cloud",
  "CI/CD & Tooling",
  "Testing",
  "Monitoring",
  "Mobile",
  "Data Engineering",
  "Security",
  "CMS & Frameworks",
];

const LABEL_ALIASES: Record<string, string> = {
  "blockchain": "Blockchain & Web3",
  "blockchain & web3": "Blockchain & Web3",
  "blockchain and web3": "Blockchain & Web3",
  "ci/cd": "CI/CD & Tooling",
  "ci/cd & tooling": "CI/CD & Tooling",
  "cloud & devops": "DevOps & Cloud",
  "devops": "DevOps & Cloud",
  "devops & cloud": "DevOps & Cloud",
  "devops & infra": "DevOps & Cloud",
  "ai": "AI & ML",
  "ai & ml": "AI & ML",
  "artificial intelligence and machine learning": "AI & ML",
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLabel(label: string) {
  const normalized = label.replace(/\s+/g, " ").trim();
  return LABEL_ALIASES[normalized.toLowerCase()] ?? normalized;
}

function splitSkillText(value: string) {
  return value
    .split(/\s*(?:•|,|;|\n)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function appendUnique(target: string[], item: string, globalSeen: Set<string>) {
  const normalized = item.replace(/\s+/g, " ").trim();
  const key = normalized.toLowerCase();

  if (!normalized || globalSeen.has(key)) return;

  target.push(normalized);
  globalSeen.add(key);
}

function fromGroupedSkills(groups: GroupedResumeSkills[]) {
  return groups.map((group) => ({
    label: normalizeLabel(group.label),
    items: group.skills,
  }));
}

function normalizeObjectGroups(value: Record<string, unknown>) {
  return Object.entries(value)
    .map(([label, rawItems]) => {
      const items = Array.isArray(rawItems)
        ? rawItems.map(normalizeString).filter(Boolean)
        : splitSkillText(normalizeString(rawItems));

      return {
        label: normalizeLabel(label),
        items,
      };
    })
    .filter((group) => group.label && group.items.length);
}

export function normalizeResumeSkillGroups(
  value: unknown,
  limitPerGroup = MAX_SKILLS_PER_GROUP,
) {
  let groups: ResumeSkillGroup[] = [];

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      groups = fromGroupedSkills(groupResumeSkills(value));
    } else {
      groups = value
        .map((item) => {
          if (!item || typeof item !== "object") return null;

          const record = item as Record<string, unknown>;
          const label = normalizeLabel(
            normalizeString(record.label ?? record.category ?? record.name ?? record.group),
          );
          const rawItems = record.items ?? record.skills ?? record.values ?? record.list;
          const items = Array.isArray(rawItems)
            ? rawItems.map(normalizeString).filter(Boolean)
            : splitSkillText(normalizeString(rawItems));

          return label && items.length ? { label, items } : null;
        })
        .filter((group): group is ResumeSkillGroup => Boolean(group));
    }
  } else if (value && typeof value === "object") {
    groups = normalizeObjectGroups(value as Record<string, unknown>);
  }

  // STRICT COPY: merge same-label groups and de-dupe identical skills, but keep
  // every skill and category. We deliberately skip the technical-allowlist
  // sanitizer (which drops unrecognized skills, renames categories, and moves
  // items into groups they were never listed under).
  const mergedGroups: ResumeSkillGroup[] = [];
  const globalSeen = new Set<string>();

  for (const group of groups) {
    let target = mergedGroups.find(
      (candidate) => candidate.label.toLowerCase() === group.label.toLowerCase(),
    );

    if (!target) {
      target = { label: group.label, items: [] };
      mergedGroups.push(target);
    }

    for (const item of group.items) {
      appendUnique(target.items, item, globalSeen);
    }
  }

  return mergedGroups
    .map((group) => ({
      label: group.label,
      items: group.items.slice(0, limitPerGroup),
    }))
    .filter((group) => group.items.length)
    .slice(0, MAX_SKILL_GROUPS)
    .sort((a, b) => {
      const aIndex = CATEGORY_ORDER.indexOf(a.label);
      const bIndex = CATEGORY_ORDER.indexOf(b.label);

      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
}

function estimateGroupSize(group: ResumeSkillGroup) {
  return group.label.length * 1.2 + group.items.join(" ").length + group.items.length * 5;
}

export function balanceSkillGroups(groups: ResumeSkillGroup[]) {
  if (groups.length < 2) {
    return [groups, []] as const;
  }

  const columns: [ResumeSkillGroup[], ResumeSkillGroup[]] = [[], []];
  const columnWeights = [0, 0];

  for (const group of groups) {
    const targetIndex = columnWeights[0] <= columnWeights[1] ? 0 : 1;
    columns[targetIndex].push(group);
    columnWeights[targetIndex] += estimateGroupSize(group);
  }

  return columns;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSkillGroup(group: ResumeSkillGroup) {
  return `<div class="resume-skill-group"><div class="resume-skill-label">${escapeHtml(
    group.label,
  )}</div><div class="resume-skill-items">${group.items
    .map(escapeHtml)
    .join(RESUME_STYLE_CONFIG.symbols.skillSeparator)}</div></div>`;
}

export function renderSkillsSectionHtml(value: unknown) {
  const groups = normalizeResumeSkillGroups(value);
  const [leftColumn, rightColumn] = balanceSkillGroups(groups);
  const columns = rightColumn.length ? [leftColumn, rightColumn] : [leftColumn];

  return `<section class="resume-section resume-skills-section" data-tailor-section="skills"><p class="section-title resume-section-title">Skills</p><div class="resume-skills-grid" data-column-count="${columns.length}">${columns
    .map(
      (column) =>
        `<div class="resume-skills-column">${column.map(renderSkillGroup).join("")}</div>`,
    )
    .join("")}</div></section>`;
}
