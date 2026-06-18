import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/public-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();

  return [
    "",
    "/auth/login",
    "/auth/signup",
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
  }));
}
