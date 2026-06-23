import type { Types } from "@/lib/id";
import { createPrismaModel } from "@/lib/prisma-model";
import { DEFAULT_AI_PROVIDER } from "@/lib/ai-provider";
import type { ResumeDocumentStyle } from "@/lib/resume-document-style";
import type { ParsedResumeData } from "@/lib/resume";
import type { AIUsage } from "@/lib/ai-usage";

export interface IGeneration {
  userId: Types.ObjectId | string;
  sourceResumeId: Types.ObjectId | string;
  jobDescriptionId?: Types.ObjectId | string | null;
  publicId?: string | null;
  tailoredData: ParsedResumeData;
  editorHtml?: string | null;
  editorDocumentStyle?: ResumeDocumentStyle | null;
  editorTemplateId?:
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
  designTemplateId?: Types.ObjectId | string | null;
  customization?: Record<string, unknown> | null;
  generatedFiles: {
    pdfUrl?: string | null;
    docxUrl?: string | null;
  };
  aiUsage?: AIUsage | null;
  createdAt?: Date;
  updatedAt?: Date;
}

void DEFAULT_AI_PROVIDER;

const Generation = createPrismaModel({
  model: "generation",
});

export default Generation;
