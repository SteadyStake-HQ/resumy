import { AppBlockingOverlay } from "@/components/app-blocking-overlay";

export default function Loading() {
  return (
    <AppBlockingOverlay
      eyebrow="Loading workspace"
      title="Preparing your workspace"
      message="Checking your profile, resumes, and task history. The app will unlock when the latest data is ready."
    />
  );
}
