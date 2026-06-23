export const RESUME_STYLE_CONFIG = {
  colors: {
    // Professional, US-style executive palette: near-black body text with a
    // restrained navy accent (instead of a bright web blue) for headings,
    // section rules, and links — reads cleaner and ATS-friendly in print.
    text: "#1A1A1A",
    heading: "#10243A",
    secondary: "#3F4A57",
    muted: "#5B6573",
    accent: "#1F3A5F",
    accentLight: "#EEF2F7",
    divider: "#1F3A5F",
    link: "#1F3A5F",
    skillText: "#1F2937",
    nameGradientStart: "#10243A",
    nameGradientEnd: "#1F3A5F",
  },
  font: {
    name: { sizePt: 26, weight: 700, lineHeight: 1.05, letterSpacingPt: -0.3, marginBottomPt: 3 },
    role: { sizePt: 10.5, weight: 600, lineHeight: 1.25, letterSpacingPt: 0.8, marginBottomPt: 7 },
    contact: { sizePt: 8.5, weight: 400, lineHeight: 1.35, marginBottomPt: 10 },
    sectionTitle: {
      sizePt: 8.5,
      weight: 700,
      lineHeight: 1.2,
      letterSpacingPt: 1.6,
      marginTopPt: 12,
      marginBottomPt: 5,
      paddingBottomPt: 4,
    },
    summary: { sizePt: 9, weight: 400, lineHeight: 1.45, marginBottomPt: 7 },
    skillCategory: { sizePt: 8.8, weight: 700, lineHeight: 1.2, marginBottomPt: 1.5 },
    skillItem: { sizePt: 8.7, weight: 400, lineHeight: 1.3 },
    jobTitle: { sizePt: 10.2, weight: 700, lineHeight: 1.25 },
    company: { sizePt: 9.5, weight: 600, lineHeight: 1.25 },
    locationDate: { sizePt: 8.7, weight: 400, lineHeight: 1.25 },
    bullet: { sizePt: 9.2, weight: 400, lineHeight: 1.4 },
    educationDegree: { sizePt: 9, weight: 700, lineHeight: 1.25 },
    educationSchool: { sizePt: 9, weight: 500, lineHeight: 1.25 },
  },
  spacing: {
    sectionGapPt: 10,
    itemGapPt: 7,
    paragraphGapPt: 5,
    bulletGapPt: 2.5,
    headerGapPt: 10,
    bulletIndentPt: 14,
    skillColumnGapPt: 22,
    skillRowGapPt: 4,
    skillGroupGapPt: 5,
  },
  symbols: {
    contactSeparator: " • ",
    skillSeparator: " • ",
    bullet: "•",
  },
} as const;

export function pt(value: number) {
  return `${value}pt`;
}

export function ptToHalfPoints(value: number) {
  return Math.round(value * 2);
}

export function ptToTwips(value: number) {
  return Math.round(value * 20);
}

export function colorForDocx(value: string) {
  return value.replace("#", "").toUpperCase();
}

export function getResumeVisualCssVariables(
  colorOverrides: Partial<Record<keyof typeof RESUME_STYLE_CONFIG.colors, string>> = {},
) {
  const { colors, font, spacing } = RESUME_STYLE_CONFIG;
  const resolvedColors = { ...colors, ...colorOverrides };

  return {
    "--resume-color-text": resolvedColors.text,
    "--resume-color-heading": resolvedColors.heading,
    "--resume-color-secondary": resolvedColors.secondary,
    "--resume-color-muted": resolvedColors.muted,
    "--resume-color-accent": resolvedColors.accent,
    "--resume-color-accent-light": resolvedColors.accentLight,
    "--resume-color-divider": resolvedColors.divider,
    "--resume-color-link": resolvedColors.link,
    "--resume-color-skill-text": resolvedColors.skillText,
    "--resume-name-size": pt(font.name.sizePt),
    "--resume-name-weight": String(font.name.weight),
    "--resume-name-line-height": String(font.name.lineHeight),
    "--resume-name-letter-spacing": pt(font.name.letterSpacingPt),
    "--resume-name-margin-bottom": pt(font.name.marginBottomPt),
    "--resume-role-size": pt(font.role.sizePt),
    "--resume-role-weight": String(font.role.weight),
    "--resume-role-line-height": String(font.role.lineHeight),
    "--resume-role-letter-spacing": pt(font.role.letterSpacingPt),
    "--resume-role-margin-bottom": pt(font.role.marginBottomPt),
    "--resume-contact-size": pt(font.contact.sizePt),
    "--resume-contact-line-height": String(font.contact.lineHeight),
    "--resume-contact-margin-bottom": pt(font.contact.marginBottomPt),
    "--resume-section-title-size": pt(font.sectionTitle.sizePt),
    "--resume-section-title-weight": String(font.sectionTitle.weight),
    "--resume-section-title-line-height": String(font.sectionTitle.lineHeight),
    "--resume-section-title-letter-spacing": pt(font.sectionTitle.letterSpacingPt),
    "--resume-section-title-margin-top": pt(font.sectionTitle.marginTopPt),
    "--resume-section-title-margin-bottom": pt(font.sectionTitle.marginBottomPt),
    "--resume-section-title-padding-bottom": pt(font.sectionTitle.paddingBottomPt),
    "--resume-summary-size": pt(font.summary.sizePt),
    "--resume-summary-line-height": String(font.summary.lineHeight),
    "--resume-summary-margin-bottom": pt(font.summary.marginBottomPt),
    "--resume-skill-category-size": pt(font.skillCategory.sizePt),
    "--resume-skill-category-line-height": String(font.skillCategory.lineHeight),
    "--resume-skill-category-margin-bottom": pt(font.skillCategory.marginBottomPt),
    "--resume-skill-item-size": pt(font.skillItem.sizePt),
    "--resume-skill-line-height": String(font.skillItem.lineHeight),
    "--resume-skill-column-gap": pt(spacing.skillColumnGapPt),
    "--resume-skill-row-gap": pt(spacing.skillRowGapPt),
    "--resume-skill-group-gap": pt(spacing.skillGroupGapPt),
    "--resume-job-title-size": pt(font.jobTitle.sizePt),
    "--resume-company-size": pt(font.company.sizePt),
    "--resume-meta-size": pt(font.locationDate.sizePt),
    "--resume-bullet-size": pt(font.bullet.sizePt),
    "--resume-bullet-line-height": String(font.bullet.lineHeight),
    "--resume-bullet-indent": pt(spacing.bulletIndentPt),
    "--resume-bullet-gap": pt(spacing.bulletGapPt),
    "--resume-item-gap": pt(spacing.itemGapPt),
    "--resume-paragraph-gap": pt(spacing.paragraphGapPt),
  } as Record<string, string>;
}
