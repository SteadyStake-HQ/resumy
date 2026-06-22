type ErrorPayload = {
  error?: string;
};

function getResponseFileName(response: Response, fallbackFileName: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const value = encodedMatch?.[1] ?? plainMatch?.[1];

  if (!value) {
    return fallbackFileName;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function downloadFileResponse(
  response: Response,
  fallbackFileName: string,
  fallbackError: string,
) {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
    throw new Error(payload?.error ?? fallbackError);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error(fallbackError);
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = getResponseFileName(response, fallbackFileName);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
