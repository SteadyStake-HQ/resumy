"use client";

import { useEffect, useRef } from "react";
import type { SafeBackgroundTask } from "@/lib/background-task";
import type { SafeGeneration } from "@/lib/generation";

export type ResumeTailoringStreamEvent =
  | {
      type: "status";
      status: SafeBackgroundTask["status"] | "streaming";
      progress?: number;
      task?: SafeBackgroundTask;
    }
  | {
      type: "section";
      section: string;
      html: string;
    }
  | {
      type: "complete";
      result: SafeGeneration;
      editorHtml?: string;
      task?: SafeBackgroundTask;
    }
  | {
      type: "error" | "canceled";
      message: string;
      task?: SafeBackgroundTask;
    }
  | {
      type: "end";
    };

type UseResumeTailoringStreamInput = {
  streamUrl: string | null;
  enabled: boolean;
  onEvent: (event: ResumeTailoringStreamEvent) => void;
};

export function useResumeTailoringStream({
  streamUrl,
  enabled,
  onEvent,
}: UseResumeTailoringStreamInput) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !streamUrl) {
      return;
    }

    const source = new EventSource(streamUrl);

    source.onmessage = (message) => {
      try {
        onEventRef.current(JSON.parse(message.data) as ResumeTailoringStreamEvent);
      } catch {
        onEventRef.current({
          type: "error",
          message: "The tailoring stream returned an unreadable update.",
        });
      }
    };

    source.onerror = () => {
      onEventRef.current({
        type: "error",
        message: "The tailoring stream was interrupted. Reopen the task to reconnect.",
      });
      source.close();
    };

    return () => source.close();
  }, [enabled, streamUrl]);
}
