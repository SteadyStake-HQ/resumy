import { createPrismaModel } from "@/lib/prisma-model";

export interface IBackgroundTaskLease {
  key: string;
  ownerToken: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const BackgroundTaskLease = createPrismaModel({
  model: "backgroundTaskLease",
});

export default BackgroundTaskLease;
