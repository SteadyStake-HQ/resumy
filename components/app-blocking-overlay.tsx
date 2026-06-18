import type { ReactNode } from "react";
import { LoadingOrb } from "@/components/ui/loading-orb";

type AppBlockingOverlayProps = {
  action?: ReactNode;
  detail?: string;
  eyebrow: string;
  message: string;
  title: string;
  tone?: "loading" | "error";
};

export function AppBlockingOverlay({
  action,
  detail,
  eyebrow,
  message,
  title,
  tone = "loading",
}: AppBlockingOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#fff7fb]/88 px-4 py-8 backdrop-blur-xl"
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-label={title}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(198,187,255,0.28),transparent_24%),radial-gradient(circle_at_86%_8%,rgba(255,197,166,0.3),transparent_22%),radial-gradient(circle_at_78%_74%,rgba(101,168,158,0.18),transparent_28%)]" />
      <section className="surface-card relative grid w-full max-w-md justify-items-center rounded-[2rem] px-6 py-8 text-center sm:px-8">
        <LoadingOrb label={title} />
        <p className="eyebrow mt-7">{eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-7 text-muted">{message}</p>
        {detail ? (
          <p className="mt-4 max-w-sm rounded-2xl border border-line bg-white/58 px-4 py-3 font-mono text-[0.72rem] leading-5 text-muted">
            {detail}
          </p>
        ) : null}
        {action ? <div className="mt-6">{action}</div> : null}
      </section>
    </div>
  );
}
