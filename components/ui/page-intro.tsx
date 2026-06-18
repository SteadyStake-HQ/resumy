import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function PageIntro({
  eyebrow,
  title,
  description,
  badge,
  actions,
  aside,
  className,
}: PageIntroProps) {
  return (
    <section className={cn("page-hero", className)}>
      <div className="absolute -left-16 top-12 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9),rgba(255,255,255,0))] blur-xl" />
      <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(198,187,255,0.5),rgba(198,187,255,0))] blur-2xl" />
      <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div className="space-y-4">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display-title max-w-4xl">{title}</h1>
          <p className="body-copy max-w-3xl">{description}</p>
          {actions ? <div className="flex flex-wrap gap-3 pt-2">{actions}</div> : null}
        </div>

        {aside ? (
          <aside className="relative z-10 rounded-[2rem] border border-white/60 bg-white/68 p-5 shadow-[0_30px_70px_-42px_rgba(91,96,139,0.45)] backdrop-blur-xl">
            {badge ? (
              <p className="eyebrow !mb-3 !text-[0.64rem] !tracking-[0.34em]">
                {badge}
              </p>
            ) : null}
            {aside}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
