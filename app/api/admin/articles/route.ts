import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { slugifyArticleTitle, toSafeArticle } from "@/lib/article";
import { listAllArticles } from "@/lib/articles";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import Article from "@/models/Article";

type ArticleRequestBody = {
  title?: string;
  slug?: string;
  author?: string;
  tags?: string[] | string;
  content?: string;
  isPublished?: boolean;
};

function normalizeTags(value: string[] | string | undefined) {
  if (Array.isArray(value)) {
    return value.map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  }

  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const articles = await listAllArticles();

  return NextResponse.json({ articles });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as ArticleRequestBody;
    const title = body.title?.trim() ?? "";
    const slug = slugifyArticleTitle(body.slug?.trim() || title);
    const content = body.content?.trim() ?? "";
    const author = body.author?.trim() || "Resume Foundry";

    if (!title || !content || !slug) {
      return NextResponse.json(
        { error: "Title, slug, and content are required." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const existingArticle = await Article.findOne({ slug }).lean();

    if (existingArticle) {
      return NextResponse.json(
        { error: "That article slug is already in use." },
        { status: 409 },
      );
    }

    const article = await Article.create({
      title,
      slug,
      author,
      content,
      tags: normalizeTags(body.tags),
      isPublished: body.isPublished ?? true,
      publishDate: new Date(),
    });

    return NextResponse.json({ article: toSafeArticle(article) }, { status: 201 });
  } catch (error) {
    console.error("Article create error", error);

    return NextResponse.json(
      { error: "We couldn't create that article." },
      { status: 500 },
    );
  }
}
