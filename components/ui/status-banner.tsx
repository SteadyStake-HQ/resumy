import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StatusBannerProps = {
  tone: "success" | "error" | "info";
  children: ReactNode;
  className?: string;
};

export function StatusBanner({
  tone,
  children,
  className,
}: StatusBannerProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-tone={tone}
      className={cn("status-banner", className)}
    >
      {children}
    </div>
  );
}
