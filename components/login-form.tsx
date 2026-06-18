"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { StatusBanner } from "@/components/ui/status-banner";
import { useToast } from "@/components/ui/toast-provider";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showErrorToast } = useToast();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/profile";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error) {
        showErrorToast("Check your email and password.", {
          title: "Login failed",
        });
        return;
      }

      router.push(result.url ?? callbackUrl);
      router.refresh();
    } catch {
      showErrorToast("Check your email and password.", {
        title: "Login failed",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="surface-card relative overflow-hidden rounded-[1.75rem] p-8 sm:p-10">
      {/* Accent strip */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[rgba(198,187,255,0.9)] via-[rgba(255,197,166,0.8)] to-[rgba(101,168,158,0.8)]" />

      {/* Header */}
      <div className="space-y-2">
        <p className="eyebrow !text-[0.62rem]">Welcome back</p>
        <h2
          className="text-[2rem] font-semibold leading-[1.1] text-foreground"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          Back to your studio.
        </h2>
        <p className="text-sm leading-6 text-muted">
          Your resumes and tools are waiting.
        </p>
      </div>

      {searchParams.get("created") === "1" ? (
        <StatusBanner tone="success" className="mt-6">
          Account ready — log in below.
        </StatusBanner>
      ) : null}

      <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field placeholder:text-muted/60"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground">
            Password
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field placeholder:text-muted/60"
            placeholder="Enter your password"
          />
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="button-primary w-full"
        >
          {isPending ? "Opening..." : "Log In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link
          href="/auth/signup"
          className="font-semibold text-accent-strong hover:text-foreground"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
