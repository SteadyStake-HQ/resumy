import type {
  MembershipDetails,
  MembershipRequestStatus,
  MembershipTier,
} from "@/models/User";

export type MembershipBenefit = {
  title: string;
  description: string;
};

export const FREE_TIER_BENEFITS: MembershipBenefit[] = [
  {
    title: "Resume uploads and analysis",
    description: "Upload source resumes, parse them, and review section-level feedback.",
  },
  {
    title: "Tailoring and design exports",
    description: "Create tailored versions and render them into polished PDF and DOCX files.",
  },
];

export const PREMIUM_TIER_BENEFITS: MembershipBenefit[] = [
  {
    title: "Resume comparison",
    description: "Compare two tailored generations side by side to spot stronger positioning.",
  },
  {
    title: "Cover letter generator",
    description: "Create job-specific cover letters from the same resume and job context.",
  },
  {
    title: "Shareable public links",
    description: "Publish a clean public view of a generation with a stable share link.",
  },
  {
    title: "Conversational AI coach",
    description: "Chat with a resume-focused assistant that can reference your current workflow context.",
  },
];

export function hasPremiumAccess(tier: string | null | undefined) {
  return tier === "premium";
}

export function getPremiumExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  return expiresAt;
}

export function normalizeRequestStatus(
  status: string | null | undefined,
): MembershipRequestStatus {
  if (
    status === "pending" ||
    status === "approved" ||
    status === "rejected"
  ) {
    return status;
  }

  return "none";
}

export function normalizeMembershipTier(
  tier: string | null | undefined,
): MembershipTier {
  return tier === "premium" ? "premium" : "free";
}

export function membershipIsExpired(membership: MembershipDetails | null | undefined) {
  if (!membership?.expiresAt) {
    return false;
  }

  return new Date(membership.expiresAt).getTime() < Date.now();
}
