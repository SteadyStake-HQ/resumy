import { createPrismaModel, modelConfigs } from "@/lib/prisma-model";
import { AI_PROVIDERS, DEFAULT_AI_PROVIDER, type AIProvider } from "@/lib/ai-provider";

export type MembershipTier = "free" | "premium";
export type MembershipStatus = "active" | "inactive" | "expired";
export type MembershipRequestStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected";

export type MembershipDetails = {
  tier: MembershipTier;
  status: MembershipStatus;
  startedAt?: Date | null;
  expiresAt?: Date | null;
  requestedTier?: "premium" | null;
  requestStatus: MembershipRequestStatus;
  requestDate?: Date | null;
  requestReason?: string;
};

export interface IUser {
  email: string;
  passwordHash: string;
  nickname: string;
  country: string;
  membership: MembershipDetails;
  settings: {
    preferredAI: AIProvider;
    preferredGeminiRouterIndex: number;
    preferredHuggingFaceRouterIndex: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

void AI_PROVIDERS;
void DEFAULT_AI_PROVIDER;

const User = createPrismaModel(modelConfigs.user);

export default User;
