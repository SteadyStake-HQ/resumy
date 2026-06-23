import type { Types } from "@/lib/id";
import { DEFAULT_AI_PROVIDER } from "@/lib/ai-provider";
import {
  normalizeResumeCustomization,
  type ResumeCustomization,
  type SafeDesignTemplate,
} from "@/lib/design-template";
import {
  normalizeResumeDocumentStyle,
  type ResumeDocumentStyle,
} from "@/lib/resume-document-style";
import { normalizeParsedResumeData, type ParsedResumeData } from "@/lib/resume";
import { normalizeAIUsage, type AIUsage } from "@/lib/ai-usage";

type GenerationLike = {
  _id: Types.ObjectId | string;
  sourceResumeId: Types.ObjectId | string;
  jobDescriptionId?: Types.ObjectId | string | null;
  designTemplateId?: Types.ObjectId | string | null;
  publicId?: string | null;
  tailoredData?: unknown;
  editorHtml?: string | null;
  editorDocumentStyle?: unknown;
  editorTemplateId?: unknown;
  aiModelUsed?: string | null;
  customization?: unknown;
  generatedFiles?: unknown;
  aiUsage?: unknown;
  createdAt?: Date | string | null;
};

type SourceResumeSummary = {
  id: string;
  fileName: string;
};

type JobDescriptionSummary = {
  id: string;
  title: string;
  company: string;
};

export type DesignTemplateSummary = Pick<
  SafeDesignTemplate,
  "id" | "name" | "slug" | "thumbnailUrl" | "category" | "engine"
>;

export type SafeGeneration = {
  id: string;
  sourceResumeId: string;
  sourceResume: SourceResumeSummary | null;
  jobDescriptionId: string | null;
  jobDescription: JobDescriptionSummary | null;
  designTemplateId: string | null;
  designTemplate: DesignTemplateSummary | null;
  publicId: string | null;
  tailoredData: ParsedResumeData;
  editorHtml: string | null;
  editorDocumentStyle: ResumeDocumentStyle;
  editorTemplateId:
    | "base"
    | "t01"
    | "t02"
    | "t03"
    | "t04"
    | "t05"
    | "t06"
    | "t07"
    | "t08"
    | "t09"
    | "t10"
    | null;
  aiModelUsed: string;
  customization: ResumeCustomization | null;
  generatedFiles: {
    pdfUrl: string | null;
    docxUrl: string | null;
  };
  aiUsage: AIUsage | null;
  createdAt: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNullableId(value: Types.ObjectId | string | null | undefined) {
  return value ? value.toString() : null;
}

function normalizeGeneratedFiles(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      pdfUrl: null,
      docxUrl: null,
    };
  }

  const generatedFiles = value as Record<string, unknown>;

  return {
    pdfUrl: normalizeString(generatedFiles.pdfUrl) || null,
    docxUrl: normalizeString(generatedFiles.docxUrl) || null,
  };
}

export function toSafeGeneration(
  generation: GenerationLike,
  options?: {
    sourceResume?: SourceResumeSummary | null;
    jobDescription?: JobDescriptionSummary | null;
    designTemplate?: DesignTemplateSummary | null;
  },
): SafeGeneration {
  return {
    id: generation._id.toString(),
    sourceResumeId: generation.sourceResumeId.toString(),
    sourceResume: options?.sourceResume ?? null,
    jobDescriptionId: toNullableId(generation.jobDescriptionId),
    jobDescription: options?.jobDescription ?? null,
    designTemplateId: toNullableId(generation.designTemplateId),
    designTemplate: options?.designTemplate ?? null,
    publicId: normalizeString(generation.publicId) || null,
    tailoredData: normalizeParsedResumeData(generation.tailoredData),
    editorHtml: normalizeString(generation.editorHtml) || null,
    editorDocumentStyle: normalizeResumeDocumentStyle(generation.editorDocumentStyle),
    editorTemplateId: ["base", "t01", "t02", "t03", "t04", "t05", "t06", "t07", "t08", "t09", "t10"].includes(
      normalizeString(generation.editorTemplateId),
    )
      ? (normalizeString(generation.editorTemplateId) as SafeGeneration["editorTemplateId"])
      : "base",
    aiModelUsed: normalizeString(generation.aiModelUsed) || DEFAULT_AI_PROVIDER,
    customization: generation.customization
      ? normalizeResumeCustomization(generation.customization)
      : null,
    generatedFiles: normalizeGeneratedFiles(generation.generatedFiles),
    aiUsage: normalizeAIUsage(generation.aiUsage),
    createdAt: generation.createdAt
      ? new Date(generation.createdAt).toISOString()
      : null,
  };
}

export function toDesignTemplateSummary(
  template: SafeDesignTemplate,
): DesignTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    slug: template.slug,
    thumbnailUrl: template.thumbnailUrl,
    category: template.category,
    engine: template.engine,
  };
}
