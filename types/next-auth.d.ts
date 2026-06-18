import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      nickname: string;
      country: string;
      membershipTier: string;
    };
  }

  interface User {
    id: string;
    nickname: string;
    country: string;
    membershipTier: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    nickname?: string;
    country?: string;
    membershipTier?: string;
  }
}
