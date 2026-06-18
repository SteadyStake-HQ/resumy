import "server-only";

import type { NextAuthOptions } from "next-auth";
import { compare } from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim();

if (!nextAuthSecret) {
  throw new Error(
    "NEXTAUTH_SECRET is required. Add it to your environment before starting the app.",
  );
}

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) {
          return null;
        }

        await connectToDatabase();

        const user = await User.findOne({ email }).select("+passwordHash");

        if (!user?.passwordHash) {
          return null;
        }

        const isValidPassword = await compare(password, user.passwordHash);

        if (!isValidPassword) {
          return null;
        }

        return {
          id: user._id.toString(),
          email: user.email,
          nickname: user.nickname ?? "",
          country: user.country ?? "",
          membershipTier: user.membership?.tier ?? "free",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        token.nickname = user.nickname;
        token.country = user.country;
        token.membershipTier = user.membershipTier;
      }

      if (!token.userId && token.sub) {
        token.userId = token.sub;
      }

      if (trigger === "update" && session.user) {
        token.nickname = session.user.nickname;
        token.country = session.user.country;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? token.sub ?? "";
        session.user.email = token.email ?? session.user.email ?? "";
        session.user.nickname = token.nickname ?? "";
        session.user.country = token.country ?? "";
        session.user.membershipTier = token.membershipTier ?? "free";
      }

      return session;
    },
  },
};
