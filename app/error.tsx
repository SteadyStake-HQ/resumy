"use client";

import { useEffect, useMemo, useState } from "react";
import { AppBlockingOverlay } from "@/components/app-blocking-overlay";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function getErrorText(error: AppErrorProps["error"]) {
  return [error.name, error.message, error.digest].filter(Boolean).join(" ");
}

function isDatabaseConnectionError(error: AppErrorProps["error"]) {
  return /Prisma|Postgres|Neon|DATABASE_URL|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|getaddrinfo|server selection|database/i.test(
    getErrorText(error),
  );
}

export default function Error({ error, reset }: AppErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const isDatabaseError = useMemo(() => isDatabaseConnectionError(error), [error]);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (!isDatabaseError) {
      return;
    }

    const retryTimer = window.setTimeout(() => {
      setIsRetrying(true);
      reset();
    }, 6000);

    return () => window.clearTimeout(retryTimer);
  }, [isDatabaseError, reset]);

  const retry = () => {
    setIsRetrying(true);
    reset();
  };

  if (isDatabaseError) {
    return (
      <AppBlockingOverlay
        tone="error"
        eyebrow="Database connection"
        title="Reconnecting to database"
        message="The app cannot reach Neon Postgres right now. This is usually a temporary DNS or network issue, so the screen is locked while the app retries."
        detail="No profile, resume, or task actions are available until the database responds."
        action={
          <button
            className="button-primary px-5 py-3 text-sm disabled:cursor-wait disabled:opacity-70"
            type="button"
            onClick={retry}
            disabled={isRetrying}
          >
            {isRetrying ? "Retrying..." : "Retry connection"}
          </button>
        }
      />
    );
  }

  return (
    <AppBlockingOverlay
      tone="error"
      eyebrow="Page recovery"
      title="Reloading workspace"
      message="The page hit an unexpected error. The app is keeping this screen locked so unfinished actions are not triggered."
      detail={error.message}
      action={
        <button className="button-primary px-5 py-3 text-sm" type="button" onClick={retry}>
          Try again
        </button>
      }
    />
  );
}
