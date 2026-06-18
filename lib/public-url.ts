export function getBaseUrl(request?: Request) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  if (request) {
    return new URL(request.url).origin;
  }

  return "http://localhost:3000";
}

export function buildPublicResumeUrl(publicId: string, request?: Request) {
  return `${getBaseUrl(request)}/public/${publicId}`;
}
