import {
  RESUME_STYLE_CONFIG,
  getResumeVisualCssVariables,
} from "@/lib/resume-style-config";

export type ResumePageSize = "a4" | "letter";

export type ResumeMarginPreset =
  | "normal"
  | "narrow"
  | "moderate"
  | "wide"
  | "mirrored"
  | "office2003"
  | "custom";

export type ResumeMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ResumeDocumentColors = {
  text: string;
  heading: string;
  secondary: string;
  muted: string;
  accent: string;
  divider: string;
  link: string;
  skillText: string;
};

export type ResumeDocumentStyle = {
  pageSize: ResumePageSize;
  marginPreset: ResumeMarginPreset;
  margins: ResumeMargins;
  fontFamily: string;
  colors: ResumeDocumentColors;
};

export const RESUME_PAGE_SIZES: Record<
  ResumePageSize,
  { label: string; widthIn: number; heightIn: number; exportFormat: "A4" | "Letter" }
> = {
  a4: { label: "A4", widthIn: 8.27, heightIn: 11.69, exportFormat: "A4" },
  letter: { label: "Letter", widthIn: 8.5, heightIn: 11, exportFormat: "Letter" },
};

export const RESUME_MARGIN_PRESETS: Record<
  ResumeMarginPreset,
  { label: string; margins: ResumeMargins }
> = {
  normal: { label: "Normal", margins: { top: 1, right: 1, bottom: 1, left: 1 } },
  narrow: { label: "Narrow", margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } },
  moderate: { label: "Moderate", margins: { top: 1, right: 0.75, bottom: 1, left: 0.75 } },
  wide: { label: "Wide", margins: { top: 1, right: 2, bottom: 1, left: 2 } },
  mirrored: { label: "Mirrored", margins: { top: 1, right: 1, bottom: 1, left: 1.25 } },
  office2003: {
    label: "Office 2003 Default",
    margins: { top: 1, right: 1.25, bottom: 1, left: 1.25 },
  },
  custom: { label: "Custom", margins: { top: 1, right: 1, bottom: 1, left: 1 } },
};

export const RESUME_FONT_OPTIONS = [
  { label: "Segoe UI", value: "Segoe UI, Arial, sans-serif" },
  { label: "Aptos", value: "Aptos, Calibri, Arial, sans-serif" },
  { label: "Calibri", value: "Calibri, Arial, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Inter", value: "Inter, Arial, sans-serif" },
  { label: "Roboto", value: "Roboto, Arial, sans-serif" },
  { label: "Lato", value: "Lato, Arial, sans-serif" },
  { label: "Open Sans", value: "Open Sans, Arial, sans-serif" },
  { label: "Source Sans 3", value: "Source Sans 3, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { label: "Cambria", value: "Cambria, Georgia, serif" },
  { label: "Garamond", value: "Garamond, Georgia, serif" },
];

const DEFAULT_RESUME_FONT_FAMILY =
  RESUME_FONT_OPTIONS.find((font) => font.label === "Source Sans 3")?.value ??
  RESUME_FONT_OPTIONS[0].value;

export const DEFAULT_RESUME_DOCUMENT_STYLE: ResumeDocumentStyle = {
  // Tailored resumes start compact so a recruiter can scan more content per page.
  pageSize: "letter",
  marginPreset: "narrow",
  margins: RESUME_MARGIN_PRESETS.narrow.margins,
  fontFamily: DEFAULT_RESUME_FONT_FAMILY,
  colors: RESUME_STYLE_CONFIG.colors,
};

export function createInitialTailoredResumeDocumentStyle(): ResumeDocumentStyle {
  const randomFont =
    RESUME_FONT_OPTIONS[Math.floor(Math.random() * RESUME_FONT_OPTIONS.length)] ??
    RESUME_FONT_OPTIONS[0];

  return {
    ...DEFAULT_RESUME_DOCUMENT_STYLE,
    margins: { ...RESUME_MARGIN_PRESETS.narrow.margins },
    fontFamily: randomFont.value,
    colors: { ...DEFAULT_RESUME_DOCUMENT_STYLE.colors },
  };
}

export const RESUME_COLOR_THEME_PRESETS = [
  {
    key: "classic-blue",
    label: "Classic Blue",
    colors: RESUME_STYLE_CONFIG.colors,
  },
  {
    key: "executive-ink",
    label: "Executive Ink",
    colors: {
      ...RESUME_STYLE_CONFIG.colors,
      text: "#1F2933",
      heading: "#111827",
      secondary: "#4B5563",
      muted: "#6B7280",
      accent: "#374151",
      divider: "#374151",
      link: "#1F2937",
      skillText: "#253041",
    },
  },
  {
    key: "emerald",
    label: "Emerald",
    colors: {
      ...RESUME_STYLE_CONFIG.colors,
      text: "#17201B",
      heading: "#0B1F17",
      secondary: "#3D5A4A",
      muted: "#66786C",
      accent: "#047857",
      divider: "#047857",
      link: "#047857",
      skillText: "#1F3B2D",
    },
  },
  {
    key: "burgundy",
    label: "Burgundy",
    colors: {
      ...RESUME_STYLE_CONFIG.colors,
      text: "#251B1F",
      heading: "#1F1117",
      secondary: "#604652",
      muted: "#816B73",
      accent: "#9F1239",
      divider: "#9F1239",
      link: "#BE123C",
      skillText: "#3B242D",
    },
  },
  {
    key: "slate-gold",
    label: "Slate Gold",
    colors: {
      ...RESUME_STYLE_CONFIG.colors,
      text: "#18222D",
      heading: "#0F172A",
      secondary: "#475569",
      muted: "#64748B",
      accent: "#B45309",
      divider: "#B45309",
      link: "#92400E",
      skillText: "#263547",
    },
  },
] as const;

function normalizeMargin(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(3, Math.max(0.25, Number(parsed.toFixed(2))));
}

function normalizeHexColor(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

function normalizeDocumentColors(value: unknown): ResumeDocumentColors {
  const fallback = RESUME_STYLE_CONFIG.colors;
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<ResumeDocumentColors>)
      : {};

  const accent = normalizeHexColor(raw.accent, fallback.accent);

  return {
    text: normalizeHexColor(raw.text, fallback.text),
    heading: normalizeHexColor(raw.heading, fallback.heading),
    secondary: normalizeHexColor(raw.secondary, fallback.secondary),
    muted: normalizeHexColor(raw.muted, fallback.muted),
    accent,
    divider: normalizeHexColor(raw.divider, accent),
    link: normalizeHexColor(raw.link, accent),
    skillText: normalizeHexColor(raw.skillText, fallback.skillText),
  };
}

export function normalizeResumeDocumentStyle(value: unknown): ResumeDocumentStyle {
  if (!value || typeof value !== "object") {
    return DEFAULT_RESUME_DOCUMENT_STYLE;
  }

  const raw = value as Partial<ResumeDocumentStyle>;
  const pageSize: ResumePageSize = raw.pageSize === "letter" ? "letter" : "a4";
  const marginPreset: ResumeMarginPreset =
    raw.marginPreset && raw.marginPreset in RESUME_MARGIN_PRESETS
      ? raw.marginPreset
      : "normal";
  const presetMargins = RESUME_MARGIN_PRESETS[marginPreset].margins;
  const rawMargins =
    raw.margins && typeof raw.margins === "object" ? raw.margins : presetMargins;
  const fontFamily = RESUME_FONT_OPTIONS.some((font) => font.value === raw.fontFamily)
    ? raw.fontFamily ?? DEFAULT_RESUME_DOCUMENT_STYLE.fontFamily
    : DEFAULT_RESUME_DOCUMENT_STYLE.fontFamily;

  return {
    pageSize,
    marginPreset,
    margins:
      marginPreset === "custom"
        ? {
            top: normalizeMargin(rawMargins.top, presetMargins.top),
            right: normalizeMargin(rawMargins.right, presetMargins.right),
            bottom: normalizeMargin(rawMargins.bottom, presetMargins.bottom),
            left: normalizeMargin(rawMargins.left, presetMargins.left),
          }
        : presetMargins,
    fontFamily,
    colors: normalizeDocumentColors(raw.colors),
  };
}

export function getResumeStyleCssVariables(style: ResumeDocumentStyle) {
  const page = RESUME_PAGE_SIZES[style.pageSize];

  return {
    "--resume-page-width": `${Math.round(page.widthIn * 96)}px`,
    "--resume-page-min-height": `${Math.round(page.heightIn * 96)}px`,
    "--resume-margin-top": `${style.margins.top}in`,
    "--resume-margin-right": `${style.margins.right}in`,
    "--resume-margin-bottom": `${style.margins.bottom}in`,
    "--resume-margin-left": `${style.margins.left}in`,
    "--resume-document-font": style.fontFamily,
    ...getResumeVisualCssVariables(style.colors),
  } as Record<string, string>;
}

export function getMarginSummary(style: ResumeDocumentStyle) {
  const preset = RESUME_MARGIN_PRESETS[style.marginPreset];
  const { top, right, bottom, left } = style.margins;

  if (top === bottom && right === left && top === right) {
    return `${preset.label} · ${top}"`;
  }

  return `${preset.label} · T ${top}" R ${right}" B ${bottom}" L ${left}"`;
}
