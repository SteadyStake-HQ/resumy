import { Types } from "@/lib/id";
import { DEFAULT_AI_PROVIDER } from "@/lib/ai-provider";
import type { IUser } from "@/models/User";

type UserLike = Pick<
  IUser,
  | "email"
  | "nickname"
  | "country"
  | "membership"
  | "settings"
  | "createdAt"
  | "updatedAt"
> & {
  _id: Types.ObjectId | string;
};

export type SafeUser = {
  id: string;
  email: string;
  nickname: string;
  country: string;
  membership: {
    tier: string;
    status: string;
    requestedTier: string | null;
    requestStatus: string;
    requestDate: string | null;
    requestReason: string;
    startedAt: string | null;
    expiresAt: string | null;
  };
  settings: {
    preferredAI: string;
    preferredGeminiRouterIndex: number;
    preferredHuggingFaceRouterIndex: number;
  };
  createdAt: string | null;
  updatedAt: string | null;
};

export function toSafeUser(user: UserLike): SafeUser {
  return {
    id: user._id.toString(),
    email: user.email,
    nickname: user.nickname ?? "",
    country: user.country ?? "",
    membership: {
      tier: user.membership?.tier ?? "free",
      status: user.membership?.status ?? "active",
      requestedTier: user.membership?.requestedTier ?? null,
      requestStatus: user.membership?.requestStatus ?? "none",
      requestDate: user.membership?.requestDate
        ? new Date(user.membership.requestDate).toISOString()
        : null,
      requestReason: user.membership?.requestReason ?? "",
      startedAt: user.membership?.startedAt
        ? new Date(user.membership.startedAt).toISOString()
        : null,
      expiresAt: user.membership?.expiresAt
        ? new Date(user.membership.expiresAt).toISOString()
        : null,
    },
    settings: {
      preferredAI: user.settings?.preferredAI ?? DEFAULT_AI_PROVIDER,
      preferredGeminiRouterIndex:
        typeof user.settings?.preferredGeminiRouterIndex === "number" &&
        Number.isInteger(user.settings.preferredGeminiRouterIndex) &&
        user.settings.preferredGeminiRouterIndex > 0
          ? user.settings.preferredGeminiRouterIndex
          : 1,
      preferredHuggingFaceRouterIndex:
        typeof user.settings?.preferredHuggingFaceRouterIndex === "number" &&
        Number.isInteger(user.settings.preferredHuggingFaceRouterIndex) &&
        user.settings.preferredHuggingFaceRouterIndex > 0
          ? user.settings.preferredHuggingFaceRouterIndex
          : 1,
    },
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
  };
}
