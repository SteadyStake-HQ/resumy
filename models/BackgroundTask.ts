import type { Types } from "@/lib/id";
import { createPrismaModel, modelConfigs } from "@/lib/prisma-model";
import {
  TASK_STATUSES,
  type BackgroundTaskStatus,
  type BackgroundTaskType,
} from "@/lib/background-task";

export interface IBackgroundTask {
  userId: Types.ObjectId | string;
  type: BackgroundTaskType;
  status: BackgroundTaskStatus;
  title: string;
  fileName: string;
  stageKey: string;
  stageLabel: string;
  progressPercent: number;
  error?: string | null;
  resultResumeId?: Types.ObjectId | string | null;
  resultGenerationId?: Types.ObjectId | string | null;
  replaceResumeId?: Types.ObjectId | string | null;
  tailoringPayload?: {
    resumeId: Types.ObjectId | string;
    savedJobDescriptionId?: Types.ObjectId | string | null;
    jobDescriptionContent: string;
    jobTitle?: string;
    jobCompany?: string;
  } | null;
  debugData?: Record<string, unknown> | null;
  sourceFile?: {
    buffer: Buffer;
    mimeType: string;
    size: number;
  };
  events: Array<{
    label: string;
    tone: "info" | "success" | "error";
    createdAt?: Date;
  }>;
  processingToken?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

void TASK_STATUSES;

const BackgroundTask = createPrismaModel(modelConfigs.backgroundTask);

export default BackgroundTask;
