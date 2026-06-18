import type { ParsedResumeData } from "@/lib/resume";

export type ResumeTemplateId =
  | "t01"
  | "t02"
  | "t03"
  | "t04"
  | "t05"
  | "t06"
  | "t07"
  | "t08"
  | "t09"
  | "t10";

export type TemplateSkillGroup = {
  group: string;
  items: string;
};

export type TemplateExperience = {
  role: string;
  company: string;
  period: string;
  bullets: string[];
};

export type TemplateEducation = {
  degree: string;
  school: string;
  period: string;
};

export type TemplateData = {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: TemplateSkillGroup[];
  experience: TemplateExperience[];
  education: TemplateEducation[];
};

export type ResumeTemplateEntry = {
  id: ResumeTemplateId;
  label: string;
  shortLabel: string;
  description: string;
};

export const RESUME_TEMPLATE_CATALOGUE: ResumeTemplateEntry[] = [
  { id: "t01", label: "01 — Editorial Serif", shortLabel: "Editorial Serif", description: "Classic serif spread with a calm editorial rhythm." },
  { id: "t02", label: "02 — Sidebar Accent", shortLabel: "Sidebar Accent", description: "Dark contact rail with a structured experience column." },
  { id: "t03", label: "03 — Mono Minimal", shortLabel: "Mono Minimal", description: "Technical resume language with a restrained mono system." },
  { id: "t04", label: "04 — Soft Cream", shortLabel: "Soft Cream", description: "Warm cream layout with gentle section blocks." },
  { id: "t05", label: "05 — Swiss Grid", shortLabel: "Swiss Grid", description: "Precise numbered grid for dense professional detail." },
  { id: "t06", label: "06 — Bold Display", shortLabel: "Bold Display", description: "Oversized identity treatment with high-contrast sections." },
  { id: "t07", label: "07 — Timeline", shortLabel: "Timeline", description: "Year rail layout for career progression." },
  { id: "t08", label: "08 — Card Modular", shortLabel: "Card Modular", description: "Modular cards and metrics for product-minded profiles." },
  { id: "t09", label: "09 — Elegant Dark", shortLabel: "Elegant Dark", description: "Dark first page with a polished executive finish." },
  { id: "t10", label: "10 — Tech Blueprint", shortLabel: "Tech Blueprint", description: "Blueprint-style technical layout with framed content." },
];

function splitSkill(value: string): { group: string; item: string } {
  const [first, ...rest] = value.split(":");
  if (!rest.length) return { group: "Core Skills", item: value.trim() };
  return {
    group: first.trim() || "Core Skills",
    item: rest.join(":").trim(),
  };
}

export function toTemplateData(resume: ParsedResumeData): TemplateData {
  const skillGroups = new Map<string, string[]>();
  resume.skills.forEach((skill) => {
    const { group, item } = splitSkill(skill);
    if (!item) return;
    skillGroups.set(group, [...(skillGroups.get(group) ?? []), item]);
  });

  return {
    name: resume.personalInfo.name || "Candidate Name",
    title: resume.personalInfo.title || "Professional",
    email: resume.personalInfo.email || "",
    phone: resume.personalInfo.phone || "",
    location: resume.personalInfo.location || "",
    summary: resume.summary || "",
    skills: Array.from(skillGroups.entries()).map(([group, items]) => ({
      group,
      items: items.join(" · "),
    })),
    experience: resume.experience.map((entry) => ({
      role: entry.title || "Role",
      company: entry.company || "",
      period: [entry.startDate, entry.endDate].filter(Boolean).join(" – "),
      bullets: entry.description.filter(Boolean),
    })),
    education: resume.education.map((entry) => ({
      degree: entry.degree || "Education",
      school: entry.institution || "",
      period: entry.year || "",
    })),
  };
}
