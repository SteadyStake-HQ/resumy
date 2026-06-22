import { Document, Packer, Paragraph, TextRun } from "docx";
import Handlebars from "handlebars/dist/cjs/handlebars";
import { getChromiumLaunchOptions, puppeteer } from "@/lib/chromium";
import { findDesignTemplate, loadTemplateAssetBundle } from "@/lib/templates";
import {
  normalizeResumeCustomization,
  type ResumeCustomization,
} from "@/lib/design-template";
import {
  normalizeParsedResumeData,
  type ParsedResumeData,
} from "@/lib/resume";
import { groupResumeSkills } from "@/lib/resume-skills";

type DensityStyle = {
  baseFontSize: number;
  lineHeight: number;
  sectionGap: number;
  paragraphGap: number;
  headingGap: number;
  docxFontSize: number;
};

const BULLET_MARKERS: Record<ResumeCustomization["bulletStyle"], string> = {
  circle: "•",
  square: "■",
  dash: "–",
  arrow: "▸",
};

const DENSITY_STYLES: Record<ResumeCustomization["pageDensity"], DensityStyle> = {
  comfortable: {
    baseFontSize: 11,
    lineHeight: 1.62,
    sectionGap: 1.5,
    paragraphGap: 0.7,
    headingGap: 0.95,
    docxFontSize: 22,
  },
  balanced: {
    baseFontSize: 10.5,
    lineHeight: 1.5,
    sectionGap: 1.25,
    paragraphGap: 0.58,
    headingGap: 0.8,
    docxFontSize: 21,
  },
  compact: {
    baseFontSize: 10,
    lineHeight: 1.38,
    sectionGap: 1,
    paragraphGap: 0.48,
    headingGap: 0.68,
    docxFontSize: 20,
  },
};

let helpersRegistered = false;

function registerHandlebarsHelpers() {
  if (helpersRegistered) {
    return;
  }

  Handlebars.registerHelper("join", (items: string[], separator = " • ") =>
    Array.isArray(items) ? items.filter(Boolean).join(separator) : "",
  );

  helpersRegistered = true;
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

function hexToRgbTriplet(hexColor: string) {
  const normalized = hexColor.replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "15 118 110";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `${red} ${green} ${blue}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildRenderContext(
  resumeData: ParsedResumeData,
  customization: ResumeCustomization,
) {
  const density = DENSITY_STYLES[customization.pageDensity];
  const contactItems = [
    resumeData.personalInfo.title,
    resumeData.personalInfo.email,
    resumeData.personalInfo.phone,
    resumeData.personalInfo.location,
  ].filter(Boolean);

  return {
    resume: resumeData,
    skillGroups: groupResumeSkills(resumeData.skills),
    customization,
    density,
    bulletMarker: BULLET_MARKERS[customization.bulletStyle],
    contactItems,
    hasSummary: Boolean(resumeData.summary),
    hasSkills: resumeData.skills.length > 0,
    hasExperience: resumeData.experience.length > 0,
    hasEducation: resumeData.education.length > 0,
  };
}

function createVariableStyleSheet(customization: ResumeCustomization) {
  const density = DENSITY_STYLES[customization.pageDensity];
  const bulletMarker = BULLET_MARKERS[customization.bulletStyle];
  const accentRgb = hexToRgbTriplet(customization.accentColor);

  return `
:root {
  --resume-font-family: ${customization.fontFamily};
  --resume-accent: ${customization.accentColor};
  --resume-accent-rgb: ${accentRgb};
  --resume-text: #172326;
  --resume-muted: #56616a;
  --resume-line: rgba(${accentRgb} / 0.2);
  --resume-paper: #ffffff;
  --resume-bullet-marker: "${bulletMarker}";
  --resume-base-size: ${density.baseFontSize}px;
  --resume-line-height: ${density.lineHeight};
  --resume-section-gap: ${density.sectionGap}rem;
  --resume-paragraph-gap: ${density.paragraphGap}rem;
  --resume-heading-gap: ${density.headingGap}rem;
  --resume-margin-top: ${customization.margins.top}in;
  --resume-margin-right: ${customization.margins.right}in;
  --resume-margin-bottom: ${customization.margins.bottom}in;
  --resume-margin-left: ${customization.margins.left}in;
}
`;
}

/**
 * Generates a print-only stylesheet injected AFTER the template CSS so it
 * wins specificity battles.
 *
 * Key problems it solves for multi-page PDFs:
 *
 * 1. Consistent page margins — the template's `.resume { padding: Xin }` only
 *    applies at the *top* of the element on page 1.  Page 2+ start mid-element
 *    with zero top spacing.  Switching to `@page { margin }` puts identical
 *    spacing on every physical page.
 *
 * 2. Decorative artefacts — border-radius, box-shadow, and body card-padding
 *    look fine on screen but produce visual noise in a flat PDF.  Strip them.
 *
 * 3. Background colour accuracy — Puppeteer respects `print-color-adjust:
 *    exact`; without it browsers may silently omit accent colours and section
 *    backgrounds.
 *
 * 4. Entry widowing — ensure individual experience/education blocks do not
 *    split mid-entry across a page break.
 */
function createPrintFixStyleSheet(customization: ResumeCustomization) {
  const { top, right, bottom, left } = customization.margins;

  return `
@page {
  size: A4;
  margin: ${top}in ${right}in ${bottom}in ${left}in;
}

@media print {
  /* Force all backgrounds and colours to print as specified */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Remove the decorative card frame — @page margin provides all spacing */
  html, body {
    margin: 0 !important;
    padding: 0 !important;
  }

  .resume {
    border-radius: 0 !important;
    box-shadow: none !important;
    min-height: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
  }

  /* Prevent individual entries from tearing across a page break */
  .experience-item,
  .education-item,
  .experience-bullets,
  .experience-item + .experience-item,
  .education-item + .education-item {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
}
`;
}

function buildDocxParagraphs(
  resumeData: ParsedResumeData,
  customization: ResumeCustomization,
) {
  const density = DENSITY_STYLES[customization.pageDensity];
  const paragraphs: Paragraph[] = [];
  const accentColor = customization.accentColor.replace("#", "");
  const bulletMarker = BULLET_MARKERS[customization.bulletStyle];
  const fontName = extractPrimaryFontName(customization.fontFamily);
  const pagePadding = Math.round(density.paragraphGap * 240);
  const sectionPadding = Math.round(density.sectionGap * 320);
  const contactLine = [
    resumeData.personalInfo.title,
    resumeData.personalInfo.email,
    resumeData.personalInfo.phone,
    resumeData.personalInfo.location,
  ]
    .filter(Boolean)
    .join(" | ");

  paragraphs.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: resumeData.personalInfo.name || "Candidate Name",
          bold: true,
          size: density.docxFontSize + 10,
          font: fontName,
          color: accentColor,
        }),
      ],
    }),
  );

  if (contactLine) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 180 },
        children: [
          new TextRun({
            text: contactLine,
            size: density.docxFontSize,
            font: fontName,
          }),
        ],
      }),
    );
  }

  const pushSectionHeading = (title: string) => {
    paragraphs.push(
      new Paragraph({
        spacing: {
          before: sectionPadding,
          after: pagePadding,
        },
        children: [
          new TextRun({
            text: title.toUpperCase(),
            bold: true,
            size: density.docxFontSize,
            font: fontName,
            color: accentColor,
          }),
        ],
      }),
    );
  };

  if (resumeData.summary) {
    pushSectionHeading("Professional Summary");
    paragraphs.push(
      new Paragraph({
        spacing: { after: pagePadding },
        children: [
          new TextRun({
            text: resumeData.summary,
            size: density.docxFontSize,
            font: fontName,
          }),
        ],
      }),
    );
  }

  if (resumeData.skills.length) {
    pushSectionHeading("Core Skills");
    for (const group of groupResumeSkills(resumeData.skills)) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `${group.label}: `,
              bold: true,
              size: density.docxFontSize,
              font: fontName,
            }),
            new TextRun({
              text: group.skills.join(" • "),
              size: density.docxFontSize,
              font: fontName,
            }),
          ],
        }),
      );
    }
  }

  if (resumeData.experience.length) {
    pushSectionHeading("Experience");

    for (const experience of resumeData.experience) {
      const titleLine = [experience.title, experience.company]
        .filter(Boolean)
        .join(" — ");
      const metaLine = [experience.location, experience.startDate, experience.endDate]
        .filter(Boolean)
        .join(" | ");

      if (titleLine) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: titleLine,
                bold: true,
                size: density.docxFontSize,
                font: fontName,
              }),
            ],
          }),
        );
      }

      if (metaLine) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: metaLine,
                italics: true,
                size: density.docxFontSize - 1,
                font: fontName,
                color: "5B6770",
              }),
            ],
          }),
        );
      }

      for (const bullet of experience.description) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: 360, hanging: 180 },
            children: [
              new TextRun({
                text: `${bulletMarker} `,
                bold: true,
                size: density.docxFontSize,
                font: fontName,
                color: accentColor,
              }),
              new TextRun({
                text: bullet,
                size: density.docxFontSize,
                font: fontName,
              }),
            ],
          }),
        );
      }
    }
  }

  if (resumeData.education.length) {
    pushSectionHeading("Education");

    for (const education of resumeData.education) {
      const line = [education.degree, education.institution]
        .filter(Boolean)
        .join(" — ");
      const year = education.year;

      paragraphs.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: line || "Education Entry",
              bold: true,
              size: density.docxFontSize,
              font: fontName,
            }),
            year
              ? new TextRun({
                  text: `  (${year})`,
                  size: density.docxFontSize - 1,
                  font: fontName,
                  color: "5B6770",
                })
              : new TextRun(""),
          ],
        }),
      );
    }
  }

  return paragraphs;
}

/**
 * Renders structured resume data into final HTML using a selected design template.
 */
export async function renderResumeHtml(
  resumeData: object,
  templateId: string,
  customizationValue: object,
) {
  registerHandlebarsHelpers();

  const template = await findDesignTemplate(templateId);

  if (!template) {
    throw new Error("Template not found.");
  }

  const { styleSource, templateSource } = await loadTemplateAssetBundle(template.slug);
  const customization = normalizeResumeCustomization(
    customizationValue,
    template.config,
  );
  const normalizedResume = normalizeParsedResumeData(resumeData);
  const context = buildRenderContext(normalizedResume, customization);
  const compiledTemplate = Handlebars.compile(templateSource);

  // createPrintFixStyleSheet is intentionally placed AFTER styleSource so
  // its @media print rules take precedence over any template-level defaults
  // (e.g. template's own `@page { margin: 0 }` gets overridden here).
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${template.name}</title>
    <style>
      ${createVariableStyleSheet(customization)}
      ${styleSource}
      ${createPrintFixStyleSheet(customization)}
    </style>
  </head>
  <body>
    ${compiledTemplate(context)}
  </body>
</html>`;
}

async function renderPdfFromHtml(html: string) {
  const browser = await puppeteer.launch(await getChromiumLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Generates a PDF export from the same HTML used for previews.
 */
export async function generatePDF(
  resumeData: object,
  templateId: string,
  customizationValue: object,
) {
  const html = await renderResumeHtml(resumeData, templateId, customizationValue);
  return renderPdfFromHtml(html);
}

/**
 * Generates a DOCX export from structured resume data and customization input.
 */
export async function generateDOCX(
  resumeData: object,
  templateId: string,
  customizationValue: object,
) {
  const template = await findDesignTemplate(templateId);

  if (!template) {
    throw new Error("Template not found.");
  }

  const customization = normalizeResumeCustomization(
    customizationValue,
    template.config,
  );
  const normalizedResume = normalizeParsedResumeData(resumeData);
  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: toTwips(customization.margins.top),
              right: toTwips(customization.margins.right),
              bottom: toTwips(customization.margins.bottom),
              left: toTwips(customization.margins.left),
            },
          },
        },
        children: buildDocxParagraphs(normalizedResume, customization),
      },
    ],
  });

  return Packer.toBuffer(document);
}

/**
 * Generates a simple PDF layout for a cover letter.
 */
export async function generateCoverLetterPDF(
  coverLetter: string,
  resumeData: ParsedResumeData,
  options?: {
    company?: string | null;
    jobTitle?: string | null;
  },
) {
  const normalizedResume = normalizeParsedResumeData(resumeData);
  const paragraphs = coverLetter
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const contactLine = [
    normalizedResume.personalInfo.email,
    normalizedResume.personalInfo.phone,
    normalizedResume.personalInfo.location,
  ]
    .filter(Boolean)
    .join(" • ");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cover Letter</title>
    <style>
      @page { size: A4; margin: 0.8in; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #162326;
        background: #ffffff;
        font-family: Georgia, serif;
        font-size: 12pt;
        line-height: 1.65;
      }
      .page {
        min-height: calc(1122px - 1.6in);
      }
      .header {
        border-bottom: 1px solid rgba(21, 61, 76, 0.14);
        margin-bottom: 1.3rem;
        padding-bottom: 0.9rem;
      }
      h1 {
        margin: 0;
        color: #153d4c;
        font-size: 22pt;
      }
      .subtle {
        color: #596872;
        font-size: 10.5pt;
      }
      .meta {
        margin-top: 0.6rem;
      }
      .body p {
        margin: 0 0 1rem;
      }
    </style>
  </head>
  <body>
    <article class="page">
      <header class="header">
        <h1>${escapeHtml(normalizedResume.personalInfo.name || "Candidate")}</h1>
        <p class="subtle">${escapeHtml(contactLine)}</p>
        <div class="meta subtle">
          ${escapeHtml(options?.jobTitle || "Cover Letter")}${
            options?.company ? ` • ${escapeHtml(options.company)}` : ""
          }
        </div>
      </header>
      <section class="body">${paragraphs}</section>
    </article>
  </body>
</html>`;

  return renderPdfFromHtml(html);
}
