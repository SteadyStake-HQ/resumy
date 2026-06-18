"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastTone = "error" | "success" | "info";

type ToastInput = {
  tone?: ToastTone;
  title: string;
  message: string;
  durationMs?: number;
};

type ToastRecord = {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
  preview: string;
  isExpandable: boolean;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
  showErrorToast: (
    message: string,
    options?: {
      title?: string;
      durationMs?: number;
    },
  ) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const fallbackToastContext: ToastContextValue = {
  showToast: ({ tone = "info", title, message }) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) return;

    if (tone === "error") {
      console.error(`${title}: ${normalizedMessage}`);
      return;
    }

    console.info(`${title}: ${normalizedMessage}`);
  },
  showErrorToast: (message, options) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) return;
    console.error(`${options?.title ?? "Something went wrong"}: ${normalizedMessage}`);
  },
  dismissToast: () => {},
};

const TOAST_PREVIEW_LIMIT = 170;
const MAX_ACTIVE_TOASTS = 3;

function getToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePreviewText(message: string) {
  return message.replace(/\s+/g, " ").trim();
}

function buildToastPreview(message: string) {
  const preview = normalizePreviewText(message);

  if (preview.length <= TOAST_PREVIEW_LIMIT) {
    return preview;
  }

  return `${preview.slice(0, TOAST_PREVIEW_LIMIT - 1).trimEnd()}...`;
}

function isExpandableMessage(message: string) {
  return (
    normalizePreviewText(message).length > TOAST_PREVIEW_LIMIT ||
    message.split(/\r?\n/).filter(Boolean).length > 3
  );
}

function getToastBadge(tone: ToastTone) {
  switch (tone) {
    case "success":
      return "OK";
    case "info":
      return "i";
    default:
      return "!";
  }
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [expandedToast, setExpandedToast] = useState<ToastRecord | null>(null);
  const timerIdsRef = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timerId = timerIdsRef.current.get(id);

    if (timerId) {
      window.clearTimeout(timerId);
      timerIdsRef.current.delete(id);
    }

    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== id),
    );
  }, []);

  const showToast = useCallback(
    ({ tone = "info", title, message, durationMs }: ToastInput) => {
      const normalizedMessage = message.trim();

      if (!normalizedMessage) {
        return;
      }

      const nextToast: ToastRecord = {
        id: getToastId(),
        tone,
        title: title.trim() || "Update",
        message: normalizedMessage,
        preview: buildToastPreview(normalizedMessage),
        isExpandable: isExpandableMessage(normalizedMessage),
      };

      setToasts((currentToasts) => {
        const nextToasts = currentToasts.filter(
          (toast) =>
            toast.title !== nextToast.title || toast.message !== nextToast.message,
        );
        const removedToasts = currentToasts.filter(
          (toast) =>
            toast.title === nextToast.title && toast.message === nextToast.message,
        );

        for (const removedToast of removedToasts) {
          const staleTimerId = timerIdsRef.current.get(removedToast.id);

          if (staleTimerId) {
            window.clearTimeout(staleTimerId);
            timerIdsRef.current.delete(removedToast.id);
          }
        }

        const trimmedToasts = nextToasts.slice(-(MAX_ACTIVE_TOASTS - 1));
        const droppedToasts = nextToasts.slice(0, Math.max(0, nextToasts.length - trimmedToasts.length));

        for (const droppedToast of droppedToasts) {
          const staleTimerId = timerIdsRef.current.get(droppedToast.id);

          if (staleTimerId) {
            window.clearTimeout(staleTimerId);
            timerIdsRef.current.delete(droppedToast.id);
          }
        }

        return [...trimmedToasts, nextToast];
      });

      const timeoutMs =
        durationMs ?? (tone === "error" ? 9000 : tone === "success" ? 4500 : 6000);
      const timerId = window.setTimeout(() => {
        dismissToast(nextToast.id);
      }, timeoutMs);

      timerIdsRef.current.set(nextToast.id, timerId);
    },
    [dismissToast],
  );

  const showErrorToast = useCallback<ToastContextValue["showErrorToast"]>(
    (message, options) => {
      showToast({
        tone: "error",
        title: options?.title ?? "Something went wrong",
        message,
        durationMs: options?.durationMs,
      });
    },
    [showToast],
  );

  useEffect(() => {
    const timerIds = timerIdsRef.current;

    return () => {
      for (const timerId of timerIds.values()) {
        window.clearTimeout(timerId);
      }

      timerIds.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      showErrorToast,
      dismissToast,
    }),
    [dismissToast, showErrorToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className="app-toast"
            data-tone={toast.tone}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <div className="app-toast__badge" aria-hidden="true">
              {getToastBadge(toast.tone)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="app-toast__title">{toast.title}</h3>
                </div>

                <button
                  type="button"
                  className="app-toast__dismiss"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                >
                  <CloseIcon />
                </button>
              </div>

              <p className="app-toast__message">{toast.preview}</p>

              {toast.isExpandable ? (
                <div className="mt-4">
                  <button
                    type="button"
                    className="toast-inline-action"
                    onClick={() => setExpandedToast(toast)}
                  >
                    Show more
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <Dialog
        open={Boolean(expandedToast)}
        onClose={() => setExpandedToast(null)}
        className="relative z-[70]"
      >
        <DialogBackdrop className="fixed inset-0 bg-foreground/40 backdrop-blur-md" />

        <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel className="surface-card w-full max-w-2xl rounded-[2.25rem] p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Error details</p>
                  <DialogTitle className="mt-2 font-[var(--font-fraunces)] text-3xl font-semibold text-foreground">
                    {expandedToast?.title ?? "Something went wrong"}
                  </DialogTitle>
                  <p className="mt-2 text-sm leading-7 text-muted">
                    Full error content from the most recent action.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedToast(null)}
                  aria-label="Close error details"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-white/70 text-muted transition hover:bg-white hover:text-foreground"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="toast-modal-content mt-6">
                <pre className="toast-modal-content__text">
                  {expandedToast?.message ?? ""}
                </pre>
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "useToast was called outside ToastProvider. Falling back to console notifications.",
      );
    }

    return fallbackToastContext;
  }

  return context;
}
