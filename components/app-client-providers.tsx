"use client";

import { AssistantProvider } from "@/components/assistant/assistant-provider";
import { TaskQueuePanel } from "@/components/task-queue-panel";
import { ToastProvider } from "@/components/ui/toast-provider";

export function AppClientProviders({
  children,
  showTaskQueue,
}: {
  children: React.ReactNode;
  showTaskQueue: boolean;
}) {
  return (
    <ToastProvider>
      <AssistantProvider>
        {children}
        {showTaskQueue ? <TaskQueuePanel /> : null}
      </AssistantProvider>
    </ToastProvider>
  );
}
