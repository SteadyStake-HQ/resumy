import type { Types } from "@/lib/id";

export type TemplateOption = {
  label: string;
  value: string;
};

export type MarginRange = {
  min: number;
  max: number;
  step: number;
};

export type ResumeCustomization = {
  fontFamily: string;
  accentColor: string;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  bulletStyle: "circle" | "square" | "dash" | "arrow";
  pageDensity: "comfortable" | "balanced" | "compact";
};

export type DesignTemplateConfig = {
  defaults: ResumeCustomization;
  options: {
    fontFamilies: TemplateOption[];
    accentColors: TemplateOption[];
    bulletStyles: TemplateOption[];
    pageDensity: TemplateOption[];
    marginRange: MarginRange;
  };
};

export type SafeDesignTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  thumbnailUrl: string | null;
  engine: "cvcraft" | "yamlresume";
  category: string;
  config: DesignTemplateConfig;
};

type DesignTemplateLike = {
  _id: Types.ObjectId | string;
  slug?: string | null;
  name?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  engine?: string | null;
  category?: string | null;
  config?: unknown;
};

type MarginValues = ResumeCustomization["margins"];

const DEFAULT_MARGIN_RANGE: MarginRange = {
  min: 0.45,
  max: 1.2,
  step: 0.05,
};

const DEFAULT_FONT_OPTIONS: TemplateOption[] = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Garamond", value: "Garamond, serif" },
];

const DEFAULT_COLOR_OPTIONS: TemplateOption[] = [
  { label: "Lagoon", value: "#0f766e" },
  { label: "Ink", value: "#1d3557" },
  { label: "Cinnamon", value: "#a04f2f" },
  { label: "Slate", value: "#475569" },
];

const DEFAULT_BULLET_OPTIONS: TemplateOption[] = [
  { label: "Circle", value: "circle" },
  { label: "Square", value: "square" },
  { label: "Dash", value: "dash" },
  { label: "Arrow", value: "arrow" },
];

const DEFAULT_DENSITY_OPTIONS: TemplateOption[] = [
  { label: "Comfortable", value: "comfortable" },
  { label: "Balanced", value: "balanced" },
  { label: "Compact", value: "compact" },
];

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function clampNumber(value: unknown, minimum: number, maximum: number) {
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(normalizeString(value));

  if (Number.isNaN(numericValue)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, numericValue));
}

function normalizeOptions(value: unknown, fallback: TemplateOption[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const options = value
    .map((entry) => {
      const option = normalizeRecord(entry);
      const label = normalizeString(option.label);
      const optionValue = normalizeString(option.value);

      if (!label || !optionValue) {
        return null;
      }

      return {
        label,
        value: optionValue,
      };
    })
    .filter((option): option is TemplateOption => Boolean(option));

  return options.length ? options : fallback;
}

function normalizeMarginRange(value: unknown): MarginRange {
  const range = normalizeRecord(value);

  const min = clampNumber(range.min, DEFAULT_MARGIN_RANGE.min, 2);
  const max = clampNumber(range.max, min, 2.5);
  const step = clampNumber(range.step, 0.01, 0.25);

  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    step: Number(step.toFixed(2)),
  };
}

function normalizeMargins(value: unknown, range: MarginRange): MarginValues {
  const margins = normalizeRecord(value);

  return {
    top: Number(clampNumber(margins.top, range.min, range.max).toFixed(2)),
    right: Number(clampNumber(margins.right, range.min, range.max).toFixed(2)),
    bottom: Number(clampNumber(margins.bottom, range.min, range.max).toFixed(2)),
    left: Number(clampNumber(margins.left, range.min, range.max).toFixed(2)),
  };
}

function ensureValidChoice(
  value: string,
  options: TemplateOption[],
  fallback: string,
) {
  return options.some((option) => option.value === value) ? value : fallback;
}

export function createDefaultResumeCustomization(): ResumeCustomization {
  return {
    fontFamily: DEFAULT_FONT_OPTIONS[0].value,
    accentColor: DEFAULT_COLOR_OPTIONS[0].value,
    margins: {
      top: 0.65,
      right: 0.65,
      bottom: 0.7,
      left: 0.65,
    },
    bulletStyle: "circle",
    pageDensity: "balanced",
  };
}

export function normalizeDesignTemplateConfig(value: unknown): DesignTemplateConfig {
  const config = normalizeRecord(value);
  const options = normalizeRecord(config.options);
  const defaults = normalizeRecord(config.defaults);

  const fontFamilies = normalizeOptions(options.fontFamilies, DEFAULT_FONT_OPTIONS);
  const accentColors = normalizeOptions(options.accentColors, DEFAULT_COLOR_OPTIONS);
  const bulletStyles = normalizeOptions(options.bulletStyles, DEFAULT_BULLET_OPTIONS);
  const pageDensity = normalizeOptions(options.pageDensity, DEFAULT_DENSITY_OPTIONS);
  const marginRange = normalizeMarginRange(options.marginRange);
  const fallback = createDefaultResumeCustomization();

  return {
    defaults: {
      fontFamily: ensureValidChoice(
        normalizeString(defaults.fontFamily) || fallback.fontFamily,
        fontFamilies,
        fontFamilies[0]?.value ?? fallback.fontFamily,
      ),
      accentColor: ensureValidChoice(
        normalizeString(defaults.accentColor) || fallback.accentColor,
        accentColors,
        accentColors[0]?.value ?? fallback.accentColor,
      ),
      margins: normalizeMargins(defaults.margins, marginRange),
      bulletStyle: ensureValidChoice(
        normalizeString(defaults.bulletStyle) || fallback.bulletStyle,
        bulletStyles,
        bulletStyles[0]?.value ?? fallback.bulletStyle,
      ) as ResumeCustomization["bulletStyle"],
      pageDensity: ensureValidChoice(
        normalizeString(defaults.pageDensity) || fallback.pageDensity,
        pageDensity,
        pageDensity[0]?.value ?? fallback.pageDensity,
      ) as ResumeCustomization["pageDensity"],
    },
    options: {
      fontFamilies,
      accentColors,
      bulletStyles,
      pageDensity,
      marginRange,
    },
  };
}

export function normalizeResumeCustomization(
  value: unknown,
  templateConfig?: DesignTemplateConfig | null,
): ResumeCustomization {
  const config = templateConfig
    ? normalizeDesignTemplateConfig(templateConfig)
    : normalizeDesignTemplateConfig({});
  const customization = normalizeRecord(value);
  const defaults = config.defaults;

  return {
    fontFamily: ensureValidChoice(
      normalizeString(customization.fontFamily) || defaults.fontFamily,
      config.options.fontFamilies,
      defaults.fontFamily,
    ),
    accentColor: ensureValidChoice(
      normalizeString(customization.accentColor) || defaults.accentColor,
      config.options.accentColors,
      defaults.accentColor,
    ),
    margins: normalizeMargins(customization.margins ?? defaults.margins, config.options.marginRange),
    bulletStyle: ensureValidChoice(
      normalizeString(customization.bulletStyle) || defaults.bulletStyle,
      config.options.bulletStyles,
      defaults.bulletStyle,
    ) as ResumeCustomization["bulletStyle"],
    pageDensity: ensureValidChoice(
      normalizeString(customization.pageDensity) || defaults.pageDensity,
      config.options.pageDensity,
      defaults.pageDensity,
    ) as ResumeCustomization["pageDensity"],
  };
}

export function toSafeDesignTemplate(
  template: DesignTemplateLike,
): SafeDesignTemplate {
  return {
    id: template._id.toString(),
    slug: normalizeString(template.slug),
    name: normalizeString(template.name) || "Untitled template",
    description: normalizeString(template.description),
    thumbnailUrl: normalizeString(template.thumbnailUrl) || null,
    engine:
      normalizeString(template.engine) === "yamlresume" ? "yamlresume" : "cvcraft",
    category: normalizeString(template.category) || "modern",
    config: normalizeDesignTemplateConfig(template.config),
  };
}
