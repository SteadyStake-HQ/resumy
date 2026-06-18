function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function confirmResumeRemoval(fileName: string) {
  const { default: Swal } = await import("sweetalert2");

  const result = await Swal.fire({
    title: "Remove this resume?",
    html: `
      <p class="app-swal-copy">
        This will remove
        <span class="app-swal-file">${escapeHtml(fileName)}</span>
        from your uploaded resumes.
      </p>
      <p class="app-swal-subtle">You can upload it again any time.</p>
    `,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Remove it",
    cancelButtonText: "Keep it",
    focusCancel: true,
    buttonsStyling: false,
    backdrop: "rgba(36, 50, 74, 0.34)",
    customClass: {
      container: "app-swal-container",
      popup: "app-swal-popup",
      icon: "app-swal-icon",
      title: "app-swal-title",
      htmlContainer: "app-swal-html",
      actions: "app-swal-actions",
      confirmButton: "app-swal-confirm",
      cancelButton: "app-swal-cancel",
    },
    showClass: {
      popup: "app-swal-show",
    },
    hideClass: {
      popup: "app-swal-hide",
    },
  });

  return result.isConfirmed;
}

export async function confirmAllResumesRemoval(resumeCount: number) {
  const { default: Swal } = await import("sweetalert2");

  const result = await Swal.fire({
    title: "Remove all resumes?",
    html: `
      <p class="app-swal-copy">
        This will remove
        <span class="app-swal-file">${resumeCount} uploaded resume${resumeCount === 1 ? "" : "s"}</span>
        from your vault.
      </p>
      <p class="app-swal-subtle">This only removes saved resumes. Background tasks stay untouched.</p>
    `,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Remove all",
    cancelButtonText: "Keep them",
    focusCancel: true,
    buttonsStyling: false,
    backdrop: "rgba(36, 50, 74, 0.34)",
    customClass: {
      container: "app-swal-container",
      popup: "app-swal-popup",
      icon: "app-swal-icon",
      title: "app-swal-title",
      htmlContainer: "app-swal-html",
      actions: "app-swal-actions",
      confirmButton: "app-swal-confirm",
      cancelButton: "app-swal-cancel",
    },
    showClass: {
      popup: "app-swal-show",
    },
    hideClass: {
      popup: "app-swal-hide",
    },
  });

  return result.isConfirmed;
}

export async function confirmTaskCancellation(fileName: string) {
  const { default: Swal } = await import("sweetalert2");

  const result = await Swal.fire({
    title: "Cancel this task?",
    html: `
      <p class="app-swal-copy">
        This will stop processing for
        <span class="app-swal-file">${escapeHtml(fileName)}</span>.
      </p>
      <p class="app-swal-subtle">You can upload it again whenever you need.</p>
    `,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Cancel task",
    cancelButtonText: "Keep running",
    focusCancel: true,
    buttonsStyling: false,
    backdrop: "rgba(36, 50, 74, 0.34)",
    customClass: {
      container: "app-swal-container",
      popup: "app-swal-popup",
      icon: "app-swal-icon",
      title: "app-swal-title",
      htmlContainer: "app-swal-html",
      actions: "app-swal-actions",
      confirmButton: "app-swal-confirm",
      cancelButton: "app-swal-cancel",
    },
    showClass: {
      popup: "app-swal-show",
    },
    hideClass: {
      popup: "app-swal-hide",
    },
  });

  return result.isConfirmed;
}

export async function confirmAllTaskCancellation(taskCount: number) {
  const { default: Swal } = await import("sweetalert2");

  const result = await Swal.fire({
    title: "Cancel all active tasks?",
    html: `
      <p class="app-swal-copy">
        This will stop
        <span class="app-swal-file">${taskCount} active task${taskCount === 1 ? "" : "s"}</span>
        in the queue.
      </p>
      <p class="app-swal-subtle">Completed and failed history will stay untouched.</p>
    `,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Cancel all",
    cancelButtonText: "Keep running",
    focusCancel: true,
    buttonsStyling: false,
    backdrop: "rgba(36, 50, 74, 0.34)",
    customClass: {
      container: "app-swal-container",
      popup: "app-swal-popup",
      icon: "app-swal-icon",
      title: "app-swal-title",
      htmlContainer: "app-swal-html",
      actions: "app-swal-actions",
      confirmButton: "app-swal-confirm",
      cancelButton: "app-swal-cancel",
    },
    showClass: {
      popup: "app-swal-show",
    },
    hideClass: {
      popup: "app-swal-hide",
    },
  });

  return result.isConfirmed;
}

export async function confirmTaskQueueClear(removableCount: number) {
  const { default: Swal } = await import("sweetalert2");

  const result = await Swal.fire({
    title: "Clear task history?",
    html: `
      <p class="app-swal-copy">
        This will remove
        <span class="app-swal-file">${removableCount} task${removableCount === 1 ? "" : "s"}</span>
        from the queue history.
      </p>
      <p class="app-swal-subtle">Completed, failed, and canceled history will be removed. Active tasks will stay in the queue.</p>
    `,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Clear history",
    cancelButtonText: "Keep history",
    focusCancel: true,
    buttonsStyling: false,
    backdrop: "rgba(36, 50, 74, 0.34)",
    customClass: {
      container: "app-swal-container",
      popup: "app-swal-popup",
      icon: "app-swal-icon",
      title: "app-swal-title",
      htmlContainer: "app-swal-html",
      actions: "app-swal-actions",
      confirmButton: "app-swal-confirm",
      cancelButton: "app-swal-cancel",
    },
    showClass: {
      popup: "app-swal-show",
    },
    hideClass: {
      popup: "app-swal-hide",
    },
  });

  return result.isConfirmed;
}
