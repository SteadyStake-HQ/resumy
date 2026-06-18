import type { Types } from "@/lib/id";
import { createPrismaModel } from "@/lib/prisma-model";
import type { AnalyzedJobDescription } from "@/lib/job-description";

export interface IJobDescription {
  userId: Types.ObjectId | string;
  title?: string | null;
  company?: string | null;
  content: string;
  parsedKeywords: string[];
  analyzedJobDescription?: AnalyzedJobDescription | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const JobDescription = createPrismaModel({
  model: "jobDescription",
});

export default JobDescription;
