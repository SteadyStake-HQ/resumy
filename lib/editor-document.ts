import {
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { getChromiumLaunchOptions, puppeteer } from "@/lib/chromium";
import {
  DEFAULT_RESUME_DOCUMENT_STYLE,
  RESUME_PAGE_SIZES,
  normalizeResumeDocumentStyle,
  type ResumeDocumentColors,
  type ResumeDocumentStyle,
} from "@/lib/resume-document-style";
import {
  RESUME_STYLE_CONFIG,
  colorForDocx,
  getResumeVisualCssVariables,
  ptToHalfPoints,
  ptToTwips,
} from "@/lib/resume-style-config";
import type { ParsedResumeData } from "@/lib/resume";
import {
  balanceSkillGroups,
  normalizeResumeSkillGroups,
  type ResumeSkillGroup,
} from "@/lib/resume-skills-section";

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
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function section(title: string, body: string, key: string) {
  return `<section data-tailor-section="${key}"><p class="section-title">${escapeHtml(title)}</p>${body}</section>`;
}

function toTwips(valueInInches: number) {
  return Math.round(valueInInches * 1440);
}

function extractPrimaryFontName(fontFamily: string) {
  return fontFamily
    .split(",")[0]
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

// Web fonts the editor offers that are NOT guaranteed to be installed on the
// machine rendering the PDF (headless Chromium). They must be loaded explicitly
// or the export silently falls back to a system default.
const GOOGLE_FONT_SPECS: Record<string, string> = {
  Inter: "Inter:wght@400;500;600;700",
  Roboto: "Roboto:wght@400;500;700",
  Lato: "Lato:wght@400;700",
  "Open Sans": "Open+Sans:wght@400;600;700",
  "Source Sans 3": "Source+Sans+3:wght@400;600;700",
};

/**
 * Builds the <link> tags that load the selected web font so the PDF/headless
 * render uses the same font as the on-screen editor. System fonts (Arial,
 * Georgia, Calibri, …) need no link and return an empty string.
 */
function buildResumeFontHeadLinks(fontFamily: string) {
  const spec = GOOGLE_FONT_SPECS[extractPrimaryFontName(fontFamily)];

  if (!spec) {
    return "";
  }

  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com" />',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${spec}&display=swap" />`,
  ].join("\n  ");
}

/**
 * Blocks until the page's web fonts have finished loading, so page.pdf() never
 * captures a frame that is still rendering in a fallback font.
 */
async function waitForDocumentFonts(page: {
  evaluate: (fn: () => unknown) => Promise<unknown>;
}) {
  try {
    await page.evaluate(async () => {
      const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
      if (fonts?.ready) {
        await fonts.ready;
      }
    });
  } catch {
    // Font readiness is best-effort; never block the export on it.
  }
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    bull: "•",
    emdash: "—",
    endash: "–",
    gt: ">",
    nbsp: " ",
    quot: '"',
    lt: "<",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

function htmlToText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

type EditorDocxBlock = {
  tag: "h1" | "h2" | "h3" | "p" | "li";
  text: string;
  className: string;
};

type EditorDocxElement = EditorDocxBlock | { type: "skillsTable"; groups: ResumeSkillGroup[] };

function extractSkillsSectionHtml(html: string) {
  return html.match(
    /<section\b[^>]*(?=[^>]*\bresume-skills-section\b)(?=[^>]*\bdata-tailor-section=["']skills["'])[^>]*>[\s\S]*?<\/section>/i,
  )?.[0] ?? "";
}

function extractSkillsGroupsFromHtml(html: string) {
  const sectionHtml = extractSkillsSectionHtml(html);
  if (!sectionHtml) return [];

  const groups: ResumeSkillGroup[] = [];
  const groupPattern =
    /<div\b[^>]*class=["'][^"']*\bresume-skill-group\b[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*\bresume-skill-label\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*\bresume-skill-items\b[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/div>/gi;

  for (const match of sectionHtml.matchAll(groupPattern)) {
    const label = htmlToText(match[1] ?? "");
    const itemText = htmlToText(match[2] ?? "");
    const items = itemText
      .split(/\s*(?:•|,|;|\n)\s*/g)
      .map((item) => item.trim())
      .filter(Boolean);

    if (label && items.length) {
      groups.push({ label, items });
    }
  }

  return groups;
}

function extractEditorDocxElements(html: string) {
  const skillsSectionHtml = extractSkillsSectionHtml(html);
  const normalizedHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const htmlForBlocks = skillsSectionHtml
    ? normalizedHtml.replace(
        skillsSectionHtml,
        '<section data-tailor-section="skills"><p class="section-title">Skills</p><p data-docx-skills-placeholder="true">__RESUME_SKILLS_TABLE__</p></section>',
      )
    : normalizedHtml;
  const elements: EditorDocxElement[] = [];
  const skillGroups = extractSkillsGroupsFromHtml(html);
  const blockPattern = /<(h1|h2|h3|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(htmlForBlocks))) {
    const tag = match[1].toLowerCase() as EditorDocxBlock["tag"];
    const attrs = match[2] ?? "";
    const text = htmlToText(match[3]);
    const className = attrs.match(/\bclass=["']([^"']+)["']/i)?.[1] ?? "";

    if (attrs.includes("data-docx-skills-placeholder")) {
      elements.push({ type: "skillsTable", groups: skillGroups });
      continue;
    }

    if (text) {
      elements.push({ tag, text, className });
    }
  }

  if (elements.length) {
    return elements;
  }

  const fallbackText = htmlToText(htmlForBlocks);
  return fallbackText ? [{ tag: "p" as const, text: fallbackText, className: "" }] : [];
}

function isDocxBlock(element: EditorDocxElement): element is EditorDocxBlock {
  return "tag" in element;
}

function buildSkillsTable(
  groups: ResumeSkillGroup[],
  fontName: string,
  colors: ResumeDocumentColors,
) {
  const { font, spacing } = RESUME_STYLE_CONFIG;
  const [leftColumn, rightColumn] = balanceSkillGroups(groups);
  const hasTwoColumns = rightColumn.length > 0;
  const maxRows = hasTwoColumns
    ? Math.max(leftColumn.length, rightColumn.length)
    : leftColumn.length;
  const emptyBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const cellForGroup = (group?: ResumeSkillGroup) =>
    new TableCell({
      borders: emptyBorders,
      margins: {
        top: ptToTwips(0.03 * 72),
        right: ptToTwips(spacing.skillColumnGapPt / 2),
        bottom: ptToTwips(spacing.skillGroupGapPt),
        left: 0,
      },
      width: { size: hasTwoColumns ? 50 : 100, type: WidthType.PERCENTAGE },
      children: group
        ? [
            new Paragraph({
              spacing: { after: ptToTwips(font.skillCategory.marginBottomPt) },
              children: [
                new TextRun({
                  text: group.label,
                  bold: true,
                  color: colorForDocx(colors.heading),
                  font: fontName,
                  size: ptToHalfPoints(font.skillCategory.sizePt),
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: ptToTwips(spacing.skillGroupGapPt) },
              children: [
                new TextRun({
                  text: group.items.join(RESUME_STYLE_CONFIG.symbols.skillSeparator),
                  color: colorForDocx(colors.skillText),
                  font: fontName,
                  size: ptToHalfPoints(font.skillItem.sizePt),
                }),
              ],
            }),
          ]
        : [new Paragraph("")],
    });

  return new Table({
    borders: emptyBorders,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: Array.from({ length: maxRows }, (_, index) =>
      new TableRow({
        cantSplit: true,
        children: hasTwoColumns
          ? [cellForGroup(leftColumn[index]), cellForGroup(rightColumn[index])]
          : [cellForGroup(leftColumn[index])],
      }),
    ),
  });
}

function buildEditorDocxParagraphs(html: string, documentStyle: ResumeDocumentStyle) {
  const fontName = extractPrimaryFontName(documentStyle.fontFamily);
  const elements = extractEditorDocxElements(html);
  const { font, spacing } = RESUME_STYLE_CONFIG;
  const colors = documentStyle.colors;
  const headingColor = colorForDocx(colors.heading);
  const textColor = colorForDocx(colors.text);
  const secondaryColor = colorForDocx(colors.secondary);
  const mutedColor = colorForDocx(colors.muted);
  const accentColor = colorForDocx(colors.accent);

  if (!elements.length) {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: "Tailored resume",
            font: fontName,
            size: 21,
          }),
        ],
      }),
    ];
  }

  return elements.map((element) => {
    if (!isDocxBlock(element)) {
      return buildSkillsTable(element.groups, fontName, colors);
    }

    const block = element;
    if (block.tag === "h1") {
      return new Paragraph({
        spacing: { after: ptToTwips(font.name.marginBottomPt) },
        children: [
          new TextRun({
            text: block.text,
            bold: true,
            color: headingColor,
            font: fontName,
            size: ptToHalfPoints(font.name.sizePt),
          }),
        ],
      });
    }

    if (block.className.includes("resume-name")) {
      return new Paragraph({
        spacing: { after: ptToTwips(font.name.marginBottomPt) },
        children: [
          new TextRun({
            text: block.text,
            bold: true,
            color: headingColor,
            font: fontName,
            size: ptToHalfPoints(font.name.sizePt),
          }),
        ],
      });
    }

    if (block.tag === "h2") {
      return new Paragraph({
        border: {
          bottom: {
            color: colorForDocx(colors.divider),
            size: 8,
            style: "single",
          },
        },
        spacing: {
          before: ptToTwips(font.sectionTitle.marginTopPt),
          after: ptToTwips(font.sectionTitle.marginBottomPt),
        },
        children: [
          new TextRun({
            text: block.text.toUpperCase(),
            bold: true,
            color: colorForDocx(colors.accent),
            font: fontName,
            size: ptToHalfPoints(font.sectionTitle.sizePt),
          }),
        ],
      });
    }

    if (block.className.includes("section-title")) {
      return new Paragraph({
        border: {
          bottom: {
            color: colorForDocx(colors.divider),
            size: 8,
            style: "single",
          },
        },
        spacing: {
          before: ptToTwips(font.sectionTitle.marginTopPt),
          after: ptToTwips(font.sectionTitle.marginBottomPt),
        },
        children: [
          new TextRun({
            text: block.text.toUpperCase(),
            bold: true,
            color: colorForDocx(colors.accent),
            font: fontName,
            size: ptToHalfPoints(font.sectionTitle.sizePt),
          }),
        ],
      });
    }

    if (block.tag === "h3") {
      const isSkillCategory = block.className.includes("skill-category");
      return new Paragraph({
        spacing: {
          before: ptToTwips(isSkillCategory ? 2 : spacing.itemGapPt),
          after: ptToTwips(isSkillCategory ? 1 : 2),
        },
        children: [
          new TextRun({
            text: block.text,
            bold: true,
            color: headingColor,
            font: fontName,
            size: ptToHalfPoints(isSkillCategory ? font.skillCategory.sizePt : font.jobTitle.sizePt),
          }),
        ],
      });
    }

    if (block.className.includes("job-title")) {
      return new Paragraph({
        spacing: {
          before: ptToTwips(spacing.itemGapPt),
          after: ptToTwips(2),
        },
        children: [
          new TextRun({
            text: block.text,
            bold: true,
            color: headingColor,
            font: fontName,
            size: ptToHalfPoints(font.jobTitle.sizePt),
          }),
        ],
      });
    }

    if (block.className.includes("skill-category")) {
      return new Paragraph({
        spacing: { before: ptToTwips(2), after: ptToTwips(1) },
        children: [
          new TextRun({
            text: block.text,
            bold: true,
            color: headingColor,
            font: fontName,
            size: ptToHalfPoints(font.skillCategory.sizePt),
          }),
        ],
      });
    }

    if (block.tag === "li") {
      return new Paragraph({
        spacing: { after: ptToTwips(spacing.bulletGapPt) },
        indent: { left: ptToTwips(spacing.bulletIndentPt), hanging: ptToTwips(7) },
        children: [
          new TextRun({
            text: `${RESUME_STYLE_CONFIG.symbols.bullet} `,
            bold: true,
            color: accentColor,
            font: fontName,
            size: ptToHalfPoints(font.bullet.sizePt),
          }),
          new TextRun({
            text: block.text,
            color: textColor,
            font: fontName,
            size: ptToHalfPoints(font.bullet.sizePt),
          }),
        ],
      });
    }

    if (block.className.includes("skill-line")) {
      // Skill lines are stored as "CategoryLabel: item1 • item2 • ...".
      // Render the label (up to the first colon) in bold heading colour and
      // the items in regular skill colour.
      const colonIdx = block.text.indexOf(":");
      const labelPart = colonIdx > -1 ? block.text.slice(0, colonIdx + 1) : "";
      const itemsPart = colonIdx > -1 ? block.text.slice(colonIdx + 1) : block.text;
      return new Paragraph({
        spacing: { after: ptToTwips(spacing.skillGroupGapPt) },
        children: [
          ...(labelPart
            ? [
                new TextRun({
                  text: labelPart,
                  bold: true,
                  color: colorForDocx(colors.accent),
                  font: fontName,
                  size: ptToHalfPoints(font.skillCategory.sizePt),
                }),
              ]
            : []),
          new TextRun({
            text: itemsPart,
            color: colorForDocx(colors.skillText),
            font: fontName,
            size: ptToHalfPoints(font.skillItem.sizePt),
          }),
        ],
      });
    }

    if (block.className.includes("role-title")) {
      return new Paragraph({
        spacing: { after: ptToTwips(font.role.marginBottomPt) },
        children: [
          new TextRun({
            text: block.text.toUpperCase(),
            bold: true,
            color: accentColor,
            font: fontName,
            size: ptToHalfPoints(font.role.sizePt),
          }),
        ],
      });
    }

    if (block.className.includes("contact-line")) {
      return new Paragraph({
        spacing: { after: ptToTwips(font.contact.marginBottomPt) },
        children: [
          new TextRun({
            text: block.text,
            color: secondaryColor,
            font: fontName,
            size: ptToHalfPoints(font.contact.sizePt),
          }),
        ],
      });
    }

    if (block.className.includes("experience-meta")) {
      return new Paragraph({
        spacing: { after: ptToTwips(3) },
        children: [
          new TextRun({
            text: block.text,
            color: mutedColor,
            font: fontName,
            italics: true,
            size: ptToHalfPoints(font.locationDate.sizePt),
          }),
        ],
      });
    }

    return new Paragraph({
      spacing: { after: ptToTwips(font.summary.marginBottomPt) },
      children: [
        new TextRun({
          text: block.text,
          color: textColor,
          font: fontName,
          size: ptToHalfPoints(font.bullet.sizePt),
        }),
      ],
    });
  });
}

/**
 * Builds the skills section as simple <p class="skill-line"> elements.
 * Avoids nested <div> grid HTML that CKEditor can reorder or strip,
 * which previously caused the skills section to disappear from exported PDFs.
 */
function buildEditorSkillsSectionHtml(skills: string[]) {
  const groups = normalizeResumeSkillGroups(skills);
  if (!groups.length) return "";

  const lines = groups
    .map(
      (group) =>
        `<p class="skill-line"><strong>${escapeHtml(group.label)}:</strong> ${group.items
          .map(escapeHtml)
          .join(RESUME_STYLE_CONFIG.symbols.skillSeparator)}</p>`,
    )
    .join("");

  return `<section data-tailor-section="skills"><p class="section-title">Skills</p>${lines}</section>`;
}

export function buildEditorSectionsFromResume(resume: ParsedResumeData) {
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
    buildEditorSkillsSectionHtml(resume.skills),
    section("Work Experience", experienceHtml, "experience"),
    section("Education", educationHtml, "education"),
  ].filter(Boolean);
}

export async function buildEditorHtmlFromResume(resume: ParsedResumeData) {
  return buildEditorSectionsFromResume(resume).join("");
}

export function wrapEditorHtmlDocument(
  html: string,
  documentStyle: ResumeDocumentStyle = DEFAULT_RESUME_DOCUMENT_STYLE,
) {
  const style = normalizeResumeDocumentStyle(documentStyle);
  const vars = {
    ...getResumeVisualCssVariables(style.colors),
    "--resume-document-font": style.fontFamily,
  };
  const cssVariables = Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join("\n");
  const pageSize = RESUME_PAGE_SIZES[style.pageSize];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  ${buildResumeFontHeadLinks(style.fontFamily)}
  <style>
    :root { ${cssVariables} }
    @page {
      size: ${pageSize.exportFormat};
      margin: ${style.margins.top}in ${style.margins.right}in ${style.margins.bottom}in ${style.margins.left}in;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body { font-family: var(--resume-document-font); font-size: var(--resume-bullet-size); color: var(--resume-color-text); line-height: 1.42; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .editor-export-surface { width: 100%; }
    section { break-inside: auto; }
    section[data-tailor-section="profile"] { border-bottom: 3px solid var(--resume-color-accent); padding-bottom: 8pt; margin-bottom: 4pt; break-inside: avoid; }
    section[data-tailor-section="skills"] { break-inside: avoid; }
    .resume-skill-group,
    .job-title,
    .experience-meta { break-inside: avoid; page-break-inside: avoid; }
    h1, .resume-name { color: var(--resume-color-heading); font-size: var(--resume-name-size); font-weight: var(--resume-name-weight); line-height: var(--resume-name-line-height); letter-spacing: var(--resume-name-letter-spacing); margin: 0 0 var(--resume-name-margin-bottom); }
    .role-title { color: var(--resume-color-accent); font-size: var(--resume-role-size); font-weight: var(--resume-role-weight); line-height: var(--resume-role-line-height); letter-spacing: var(--resume-role-letter-spacing); margin: 0 0 var(--resume-role-margin-bottom); text-transform: uppercase; }
    .contact-line { color: var(--resume-color-secondary); font-size: var(--resume-contact-size); line-height: var(--resume-contact-line-height); margin: 0 0 var(--resume-contact-margin-bottom); }
    h2, .section-title { border-bottom: 2px solid var(--resume-color-divider); color: var(--resume-color-accent); font-size: var(--resume-section-title-size); font-weight: var(--resume-section-title-weight); letter-spacing: var(--resume-section-title-letter-spacing); line-height: var(--resume-section-title-line-height); margin: var(--resume-section-title-margin-top) 0 var(--resume-section-title-margin-bottom); padding-bottom: var(--resume-section-title-padding-bottom); text-transform: uppercase; }
    h3, .job-title { color: var(--resume-color-heading); font-size: var(--resume-job-title-size); font-weight: 700; line-height: 1.25; margin: var(--resume-item-gap) 0 2pt; }
    p { font-size: var(--resume-bullet-size); margin: 0 0 var(--resume-paragraph-gap); }
    ul { margin: 6px 0 12px 20px; padding: 0; }
    li { color: var(--resume-color-text); font-size: var(--resume-bullet-size); line-height: var(--resume-bullet-line-height); margin: 0 0 var(--resume-bullet-gap); }
    .experience-meta { color: var(--resume-color-muted); font-size: var(--resume-meta-size); margin-bottom: 3pt; }
    .skill-line { color: var(--resume-color-text); font-size: var(--resume-skill-item-size); line-height: 1.5; margin: 0 0 var(--resume-skill-group-gap); }
    .skill-line strong { color: var(--resume-color-accent); font-size: var(--resume-skill-category-size); }
    .resume-skills-grid { column-gap: var(--resume-skill-column-gap); display: grid; grid-template-columns: 1fr 1fr; margin-top: 2pt; row-gap: var(--resume-skill-row-gap); }
    .resume-skills-grid[data-column-count="1"] { grid-template-columns: 1fr; }
    .resume-skills-column { min-width: 0; }
    .resume-skill-group { margin-bottom: var(--resume-skill-group-gap); }
    .resume-skill-label { color: var(--resume-color-heading); font-size: var(--resume-skill-category-size); font-weight: 700; letter-spacing: 0; line-height: var(--resume-skill-category-line-height); margin-bottom: var(--resume-skill-category-margin-bottom); }
    .resume-skill-items { color: var(--resume-color-skill-text); font-size: var(--resume-skill-item-size); font-weight: 400; line-height: var(--resume-skill-line-height); margin: 0; }
    @media print {
      .editor-export-surface { overflow: visible; }
      .page-break { break-after: page; height: 0 !important; min-height: 0 !important; page-break-after: always; padding: 0 !important; }
      .page-break::after,
      .page-break__label { display: none !important; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body><main class="editor-export-surface">${html}</main></body>
</html>`;
}

/**
 * Export a pre-built full HTML document to PDF without any wrapping or
 * transformation — used when the caller (e.g. a visual template) has already
 * serialised the complete `<!doctype html>` string including its own CSS.
 */
export async function generateRawHtmlPdf(fullHtml: string) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch(await getChromiumLaunchOptions());
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
    await waitForDocumentFonts(page);
    // Use the @page CSS rule from the template for page dimensions.
    // Do NOT set explicit width/height here — that would constrain the output
    // to a single page and clip any overflow content.
    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } catch (error) {
    throw new Error(
      "Template PDF export requires Chromium to launch successfully. Install the Chrome runtime libraries or provide a working PUPPETEER_EXECUTABLE_PATH.",
      { cause: error },
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function generateEditorPdf(
  html: string,
  documentStyle: ResumeDocumentStyle = DEFAULT_RESUME_DOCUMENT_STYLE,
) {
  const style = normalizeResumeDocumentStyle(documentStyle);
  const pageSize = RESUME_PAGE_SIZES[style.pageSize];
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    browser = await puppeteer.launch(await getChromiumLaunchOptions());
    const page = await browser.newPage();
    await page.setContent(wrapEditorHtmlDocument(html, style), {
      waitUntil: "networkidle0",
    });
    await waitForDocumentFonts(page);
    return await page.pdf({
      format: pageSize.exportFormat,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } catch (error) {
    throw new Error(
      "High-fidelity PDF export requires Chromium to launch successfully. Install the Chrome runtime libraries or provide a working PUPPETEER_EXECUTABLE_PATH.",
      { cause: error },
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function generateEditorDocx(
  html: string,
  documentStyle: ResumeDocumentStyle = DEFAULT_RESUME_DOCUMENT_STYLE,
) {
  const style = normalizeResumeDocumentStyle(documentStyle);
  const pageSize = RESUME_PAGE_SIZES[style.pageSize];
  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: toTwips(pageSize.widthIn),
              height: toTwips(pageSize.heightIn),
            },
            margin: {
              top: toTwips(style.margins.top),
              right: toTwips(style.margins.right),
              bottom: toTwips(style.margins.bottom),
              left: toTwips(style.margins.left),
            },
          },
        },
        children: buildEditorDocxParagraphs(html, style),
      },
    ],
  });

  return Packer.toBuffer(document);
}
