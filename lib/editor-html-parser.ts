import {
  normalizeParsedResumeData,
  type ParsedResumeData,
  type ResumeExperience,
} from "@/lib/resume";

function textOf(root: ParentNode, selector: string) {
  return root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function textsOf(root: ParentNode, selector: string) {
  return Array.from(root.querySelectorAll(selector))
    .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter(Boolean);
}

function splitSkillItems(value: string) {
  return value
    .split(/\s*(?:•|·|,|;|\n)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function directTextWithout(root: Element, selector: string) {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll(selector).forEach((node) => node.remove());
  return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function parseGenericSkills(document: Document, fallback: ParsedResumeData) {
  const skillLines = Array.from(document.querySelectorAll(".skill-line"));
  if (skillLines.length) {
    return skillLines.flatMap((line) => {
      const label = textOf(line, "strong").replace(/:\s*$/, "");
      const itemText = (line.textContent ?? "").replace(textOf(line, "strong"), "");
      return splitSkillItems(itemText).map((item) =>
        label ? `${label}: ${item}` : item,
      );
    });
  }

  const groups = Array.from(document.querySelectorAll(".resume-skill-group"));
  if (!groups.length) return fallback.skills;

  return groups.flatMap((group) => {
    const label = textOf(group, ".resume-skill-label");
    const itemsText = textOf(group, ".resume-skill-items");
    return splitSkillItems(itemsText).map((item) =>
      label ? `${label}: ${item}` : item,
    );
  });
}

function parseTemplateSkills(document: Document, fallback: ParsedResumeData) {
  const v4Rows = Array.from(document.querySelectorAll(".rt-v4-skill-row"));
  if (v4Rows.length) {
    return v4Rows.flatMap((row) => {
      const label = textOf(row, "b");
      const items = splitSkillItems(textOf(row, "span"));
      return items.map((item) => (label ? `${label}: ${item}` : item));
    });
  }

  const templateGroups = Array.from(document.querySelectorAll(".rt-skill-group"));
  if (templateGroups.length) {
    return templateGroups.flatMap((group) => {
      const label = textOf(group, ".rt-skill-label");
      const items = splitSkillItems(textOf(group, ".rt-skill-items"));
      return items.map((item) => (label ? `${label}: ${item}` : item));
    });
  }

  const chipSkills = textsOf(document, ".rt-v1-chip, .rt-v3-pill");
  if (chipSkills.length) return chipSkills;

  const sidebarSkills = Array.from(document.querySelectorAll(".rt-v2-skill-label"))
    .map((node) => directTextWithout(node, "span"))
    .filter(Boolean);
  return sidebarSkills.length ? sidebarSkills : fallback.skills;
}

function parseGenericExperience(document: Document, fallback: ParsedResumeData) {
  const sections = Array.from(document.querySelectorAll('[data-tailor-section="experience"] .experience-item'));
  if (!sections.length) {
    const experienceSection = document.querySelector('[data-tailor-section="experience"]');
    const titles = Array.from(experienceSection?.querySelectorAll(".job-title") ?? []);
    if (!titles.length) return fallback.experience;

    return fallback.experience.map((fallbackEntry, index) => {
      const title = titles[index];
      if (!title) return fallbackEntry;
      const bullets: string[] = [];
      let cursor = title.nextElementSibling;
      while (cursor && !cursor.classList.contains("job-title")) {
        if (cursor.matches("ul, ol")) {
          bullets.push(...textsOf(cursor, "li"));
        }
        cursor = cursor.nextElementSibling;
      }
      return {
        ...fallbackEntry,
        title: title.textContent?.replace(/\s+/g, " ").trim() || fallbackEntry.title,
        description: bullets.length ? bullets : fallbackEntry.description,
      };
    });
  }

  return fallback.experience.map((fallbackEntry, index) => {
    const section = sections[index];
    if (!section) return fallbackEntry;
    const titleLine = textOf(section, ".job-title");
    const bullets = textsOf(section, "li");

    return {
      ...fallbackEntry,
      title: titleLine || fallbackEntry.title,
      description: bullets.length ? bullets : fallbackEntry.description,
    };
  });
}

function parseTemplateExperience(document: Document, fallback: ParsedResumeData) {
  const roleBlocks = Array.from(
    document.querySelectorAll(".rt-role-block, .rt-v1-role, .rt-v2-exp-role, .rt-v3-role, .rt-v4-role-block"),
  );
  if (!roleBlocks.length) return fallback.experience;

  return fallback.experience.map((fallbackEntry, index) => {
    const block = roleBlocks[index];
    if (!block) return fallbackEntry;
    const title = textOf(
      block,
      ".rt-role-title, .rt-v1-role-title, .rt-v2-role-title, .rt-v3-role-title, .rt-v4-role-title",
    );
    const bullets = textsOf(block, "li");
    return {
      ...fallbackEntry,
      title: title || fallbackEntry.title,
      description: bullets.length ? bullets : fallbackEntry.description,
    };
  });
}

export function extractResumeDataFromEditorHtml(
  html: string,
  fallbackResume: ParsedResumeData,
) {
  const fallback = normalizeParsedResumeData(fallbackResume);

  if (typeof window === "undefined" || !html.trim()) {
    return fallback;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  const name =
    textOf(document, ".resume-name") ||
    textOf(document, ".rt-name") ||
    textOf(document, ".rt-v1-name") ||
    textOf(document, ".rt-v2-name") ||
    textOf(document, ".rt-v3-name") ||
    textOf(document, ".rt-v4-name") ||
    fallback.personalInfo.name;

  const title =
    textOf(document, ".role-title") ||
    textOf(document, ".rt-title") ||
    textOf(document, ".rt-v2-role") ||
    textOf(document, ".rt-v4-role-label") ||
    fallback.personalInfo.title;

  const summary =
    textOf(document, '[data-tailor-section="summary"] p:not(.section-title)') ||
    textOf(document, ".rt-summary") ||
    textOf(document, ".rt-v1-tagline") ||
    textOf(document, ".rt-v2-summary") ||
    textOf(document, ".rt-v4-summary") ||
    fallback.summary;

  const genericExperience = parseGenericExperience(document, fallback);
  const templateExperience = parseTemplateExperience(document, fallback);
  const experience: ResumeExperience[] =
    genericExperience !== fallback.experience ? genericExperience : templateExperience;

  const genericSkills = parseGenericSkills(document, fallback);
  const templateSkills = parseTemplateSkills(document, fallback);

  return normalizeParsedResumeData({
    ...fallback,
    personalInfo: {
      ...fallback.personalInfo,
      name,
      title,
    },
    summary,
    skills: genericSkills !== fallback.skills ? genericSkills : templateSkills,
    experience,
  });
}
