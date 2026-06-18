"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";

type SignupResponse = {
  error?: string;
};

export function SignupForm() {
  const router = useRouter();
  const { showErrorToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      showErrorToast("Passwords do not match.", { title: "Signup failed" });
      return;
    }

    setIsPending(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword }),
      });

      const payload = (await response.json()) as SignupResponse;

      if (!response.ok) {
        showErrorToast(payload.error ?? "We couldn't create your account.", {
          title: "Signup failed",
        });
        return;
      }

      router.push("/auth/login?created=1");
    } catch {
      showErrorToast("We couldn't create your account.", {
        title: "Signup failed",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="surface-card relative overflow-hidden rounded-[1.75rem] p-8 sm:p-10">
      {/* Accent strip */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[rgba(101,168,158,0.8)] via-[rgba(198,187,255,0.9)] to-[rgba(255,197,166,0.8)]" />

      {/* Header */}
      <div className="space-y-2">
        <p className="eyebrow !text-[0.62rem]">New here</p>
        <h2
          className="text-[2rem] font-semibold leading-[1.1] text-foreground"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          Create your resume hub.
        </h2>
        <p className="text-sm leading-6 text-muted">
          Free to start. Upload, tailor, and export.
        </p>
      </div>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field placeholder:text-muted/60"
            placeholder="At least 8 characters"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-foreground">
            Confirm password
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field placeholder:text-muted/60"
            placeholder="Re-enter your password"
          />
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="button-primary w-full"
        >
          {isPending ? "Creating..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="font-semibold text-accent-strong hover:text-foreground"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
