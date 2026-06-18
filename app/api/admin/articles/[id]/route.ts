import { Types } from "@/lib/id";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { slugifyArticleTitle, toSafeArticle } from "@/lib/article";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import Article from "@/models/Article";

type ArticleUpdateRequestBody = {
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

type ArticleRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, { params }: ArticleRouteProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid article id." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as ArticleUpdateRequestBody;
    const title = body.title?.trim() ?? "";
    const slug = slugifyArticleTitle(body.slug?.trim() || title);
    const content = body.content?.trim() ?? "";

    if (!title || !content || !slug) {
      return NextResponse.json(
        { error: "Title, slug, and content are required." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const conflictingArticle = await Article.findOne({
      slug,
      _id: { $ne: id },
    }).lean();

    if (conflictingArticle) {
      return NextResponse.json(
        { error: "That article slug is already in use." },
        { status: 409 },
      );
    }

    const article = await Article.findByIdAndUpdate(
      id,
      {
        title,
        slug,
        author: body.author?.trim() || "Resume Foundry",
        content,
        tags: normalizeTags(body.tags),
        isPublished: body.isPublished ?? true,
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    return NextResponse.json({ article: toSafeArticle(article) });
  } catch (error) {
    console.error("Article update error", error);

    return NextResponse.json(
      { error: "We couldn't update that article." },
      { status: 500 },
    );
  }
}
