"use client";

import {
  createContext,
  Suspense,
  useContext,
  useMemo,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { notifyGeminiRouterRefresh } from "@/lib/client-api";

type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantContextValue = {
  isOpen: boolean;
  messages: AssistantMessage[];
  isSending: boolean;
  toggleOpen: () => void;
  close: () => void;
  sendMessage: (message: string) => Promise<void>;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

const ASSISTANT_PATHS = new Set([
  "/profile",
  "/retail",
  "/history",
  "/compare",
  "/membership",
]);

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

export function useAssistant() {
  const context = useContext(AssistantContext);

  if (!context) {
    throw new Error("useAssistant must be used within AssistantProvider.");
  }

  return context;
}

function getAssistantRouteContext() {
  if (typeof window === "undefined") {
    return {
      resumeId: undefined,
      generationId: undefined,
      jobDescriptionId: undefined,
    };
  }

  const params = new URLSearchParams(window.location.search);

  return {
    resumeId: params.get("resumeId") ?? undefined,
    generationId: params.get("generationId") ?? undefined,
    jobDescriptionId: params.get("jobDescriptionId") ?? undefined,
  };
}

function AssistantWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    isOpen,
    messages,
    isSending,
    toggleOpen,
    close,
    sendMessage,
  } = useAssistant();
  const [draft, setDraft] = useState("");

  if (!ASSISTANT_PATHS.has(pathname)) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      {isOpen ? (
        <section className="pointer-events-auto surface-card w-[min(28rem,calc(100vw-2rem))] rounded-[1.95rem] p-4 shadow-[0_24px_48px_-28px_rgba(23,48,39,0.4)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow !text-[0.58rem] !tracking-[0.26em]">
                AI assistant
              </p>
              <p className="mt-2 font-[var(--font-fraunces)] text-2xl font-semibold text-foreground">
                Resume coach
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close assistant"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-white/70 text-muted transition hover:bg-white hover:text-foreground"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                  message.role === "assistant"
                    ? "border border-line bg-white/85 text-foreground"
                    : "bg-[linear-gradient(145deg,#263552,#4c5b82)] text-white"
                }`}
              >
                {message.content}
              </div>
            ))}
          </div>

          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();

              const nextMessage = draft.trim();

              if (!nextMessage) {
                return;
              }

              setDraft("");
              void sendMessage(nextMessage);
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              className="textarea-field text-sm"
              placeholder={`Ask about resume strategy, this page, or the current workflow on ${pathname}.`}
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSending || draft.trim().length < 2}
                className="button-primary !px-5 !py-3 !text-sm"
              >
                {isSending ? "Thinking..." : "Send"}
              </button>
              <p className="self-center text-xs uppercase tracking-[0.18em] text-muted">
                {searchParams.get("generationId")
                  ? "Generation context detected"
                  : searchParams.get("resumeId")
                    ? "Resume context detected"
                    : "General page context"}
              </p>
            </div>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={toggleOpen}
        className="pointer-events-auto button-dark !px-5 !py-3 !text-sm"
      >
        {isOpen ? "Hide Assistant" : "Ask AI"}
      </button>
    </div>
  );
}

export function AssistantProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { showErrorToast } = useToast();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: "assistant",
      content:
        "Ask for resume strategy, tailoring advice, or help using the platform. I’ll keep the guidance practical.",
    },
  ]);
  const [isSending, setIsSending] = useState(false);

  const value = useMemo<AssistantContextValue>(
    () => ({
      isOpen,
      messages,
      isSending,
      toggleOpen: () => setIsOpen((currentValue) => !currentValue),
      close: () => setIsOpen(false),
      sendMessage: async (message) => {
        setMessages((currentMessages) => [
          ...currentMessages,
          { role: "user", content: message },
        ]);
        setIsSending(true);

        try {
          const routeContext = getAssistantRouteContext();

          const response = await fetch("/api/assistant", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message,
              context: {
                currentPath: pathname,
                ...routeContext,
              },
            }),
          });
          const payload = (await response.json()) as {
            error?: string;
            reply?: string;
          };

          if (!response.ok || !payload.reply) {
            throw new Error(
              payload.error ?? "The assistant couldn't reply right now.",
            );
          }

          setMessages((currentMessages) => [
            ...currentMessages,
            { role: "assistant", content: payload.reply as string },
          ]);
        } catch (error) {
          showErrorToast(
            error instanceof Error
              ? error.message
              : "The assistant couldn't reply right now.",
            {
              title: "Assistant reply couldn't finish",
            },
          );
        } finally {
          setIsSending(false);
          notifyGeminiRouterRefresh();
        }
      },
    }),
    [isOpen, isSending, messages, pathname, showErrorToast],
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <AssistantWidget />
      </Suspense>
    </AssistantContext.Provider>
  );
}
