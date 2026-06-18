import type { ParsedResumeData } from "@/lib/resume";
import { renderSkillsSectionHtml } from "@/lib/resume-skills-section";
import { RESUME_STYLE_CONFIG } from "@/lib/resume-style-config";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paragraph(value: string) {
  return value ? `<p>${escapeHtml(value)}</p>` : "";
}

function list(items: string[]) {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  if (!normalized.length) return "";
  return `<ul>${normalized.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function section(title: string, body: string, key: string) {
  if (!body) return "";
  return `<section data-tailor-section="${key}"><p class="section-title">${escapeHtml(title)}</p>${body}</section>`;
}

export function buildClientEditorHtmlFromResume(resume: ParsedResumeData) {
  const experienceHtml = resume.experience
    .map((entry) =>
      [
        `<p class="job-title">${escapeHtml(entry.title || "Role")}</p>`,
        `<p class="experience-meta">${escapeHtml(
          [entry.company, entry.location, [entry.startDate, entry.endDate].filter(Boolean).join(" - ")]
            .filter(Boolean)
            .join(" | "),
        )}</p>`,
        list(entry.description),
      ].join(""),
    )
    .join("");
  const educationHtml = resume.education
    .map((entry) =>
      paragraph([entry.degree, entry.institution, entry.year].filter(Boolean).join(" | ")),
    )
    .join("");

  return [
    `<section data-tailor-section="profile"><p class="resume-name">${escapeHtml(
      resume.personalInfo.name || "Candidate Name",
    )}</p>${
      resume.personalInfo.title
        ? `<p class="role-title">${escapeHtml(resume.personalInfo.title)}</p>`
        : ""
    }<p class="contact-line">${escapeHtml(
      [
        resume.personalInfo.email,
        resume.personalInfo.phone,
        resume.personalInfo.location,
      ]
        .filter(Boolean)
        .join(RESUME_STYLE_CONFIG.symbols.contactSeparator),
    )}</p></section>`,
    section("Summary", paragraph(resume.summary), "summary"),
    resume.skills.length ? renderSkillsSectionHtml(resume.skills) : "",
    section("Work Experience", experienceHtml, "experience"),
    section("Education", educationHtml, "education"),
  ]
    .filter(Boolean)
    .join("");
}
