import type { Types } from "@/lib/id";

type ArticleLike = {
  _id: Types.ObjectId | string;
  title?: string | null;
  slug?: string | null;
  content?: string | null;
  author?: string | null;
  tags?: unknown;
  publishDate?: Date | string | null;
  isPublished?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type SafeArticle = {
  id: string;
  title: string;
  slug: string;
  content: string;
  author: string;
  tags: string[];
  publishDate: string | null;
  isPublished: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .slice(0, 12);
}

export function slugifyArticleTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function toSafeArticle(article: ArticleLike): SafeArticle {
  return {
    id: article._id.toString(),
    title: normalizeString(article.title) || "Untitled article",
    slug: normalizeString(article.slug),
    content: normalizeString(article.content),
    author: normalizeString(article.author) || "Resume Foundry",
    tags: normalizeStringArray(article.tags),
    publishDate: article.publishDate
      ? new Date(article.publishDate).toISOString()
      : null,
    isPublished: Boolean(article.isPublished ?? true),
    createdAt: article.createdAt
      ? new Date(article.createdAt).toISOString()
      : null,
    updatedAt: article.updatedAt
      ? new Date(article.updatedAt).toISOString()
      : null,
  };
}
