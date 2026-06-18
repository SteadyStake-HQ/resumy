import type { Types } from "@/lib/id";
import { createPrismaModel } from "@/lib/prisma-model";
import type {
  ParsedResumeData,
  ResumeExtractionMeta,
  ResumeAnalysisReport,
} from "@/lib/resume";

export interface IResume {
  userId: Types.ObjectId | string;
  fileName: string;
  originalUrl?: string | null;
  rawText?: string | null;
  parsedData: ParsedResumeData;
  analysisReport: ResumeAnalysisReport;
  extractionMeta?: ResumeExtractionMeta;
  createdAt?: Date;
  updatedAt?: Date;
}

const Resume = createPrismaModel({
  model: "resume",
});

export default Resume;
