import { connectToDatabase } from "@/lib/db";
import { slugifyArticleTitle, toSafeArticle } from "@/lib/article";
import Article from "@/models/Article";

const DEFAULT_ARTICLES = [
  {
    title: "How to Build an ATS-Friendly Resume",
    author: "Resume Foundry",
    tags: ["resume", "ats", "basics"],
    content: `# How to Build an ATS-Friendly Resume

An ATS-friendly resume is not a boring resume. It is a resume that stays easy to parse while still telling a persuasive story.

## What matters most

- Keep section headings obvious: Summary, Skills, Experience, Education.
- Use standard date formats and job titles.
- Avoid burying keywords in graphics or columns that parsers may skip.
- Match the language of the job description where it is truthful to your background.

## The practical test

If a recruiter can skim your document in under thirty seconds and understand your fit, you are on the right path.`,
  },
  {
    title: "Turn One Resume into Multiple Strong Variants",
    author: "Resume Foundry",
    tags: ["tailoring", "strategy", "job-search"],
    content: `# Turn One Resume into Multiple Strong Variants

The best resume systems separate your source material from the final version you send out.

## Start with a master resume

Keep every relevant achievement, technology, and leadership example in one place.

## Tailor with intention

- Pull forward the skills that matter most to the role.
- Rewrite your first bullet under each recent role so it matches the job's priorities.
- Remove unrelated detail when it distracts from the story you need to tell.

Tailoring is not exaggeration. It is editorial focus.`,
  },
  {
    title: "Cover Letters That Add Real Signal",
    author: "Resume Foundry",
    tags: ["cover-letter", "applications"],
    content: `# Cover Letters That Add Real Signal

A cover letter should not repeat your resume line by line. It should connect your background to this role, at this company, right now.

## A simple structure

1. Open with the role and why it matters to you.
2. Highlight one or two experiences that map directly to the job.
3. Close with forward momentum and confidence.

## Keep it concise

Aim for a strong page or less. Precision beats volume every time.`,
  },
];

function getDefaultSafeArticles() {
  return DEFAULT_ARTICLES.map((article, index) =>
    toSafeArticle({
      _id: `default-article-${index + 1}`,
      ...article,
      slug: slugifyArticleTitle(article.title),
      isPublished: true,
      publishDate: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  );
}

export async function syncDefaultArticles() {
  await connectToDatabase();

  const articles = await Promise.all(
    DEFAULT_ARTICLES.map((article) =>
      Article.findOneAndUpdate(
        { slug: slugifyArticleTitle(article.title) },
        {
          ...article,
          slug: slugifyArticleTitle(article.title),
          isPublished: true,
          publishDate: new Date(),
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        },
      ).lean(),
    ),
  );

  return articles.filter(Boolean).map((article) => toSafeArticle(article));
}

export async function listPublishedArticles() {
  if (!process.env.DATABASE_URL?.trim()) {
    return getDefaultSafeArticles();
  }

  await connectToDatabase();

  let articles = await Article.find({ isPublished: true })
    .sort({ publishDate: -1, createdAt: -1 })
    .lean();

  if (!articles.length) {
    await syncDefaultArticles();
    articles = await Article.find({ isPublished: true })
      .sort({ publishDate: -1, createdAt: -1 })
      .lean();
  }

  return articles.map((article) => toSafeArticle(article));
}

export async function listAllArticles() {
  if (!process.env.DATABASE_URL?.trim()) {
    return getDefaultSafeArticles();
  }

  await connectToDatabase();

  let articles = await Article.find({})
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  if (!articles.length) {
    await syncDefaultArticles();
    articles = await Article.find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
  }

  return articles.map((article) => toSafeArticle(article));
}

export async function findArticleBySlug(slug: string) {
  if (!process.env.DATABASE_URL?.trim()) {
    return (
      getDefaultSafeArticles().find((article) => article.slug === slug) ?? null
    );
  }

  await connectToDatabase();

  let article = await Article.findOne({ slug, isPublished: true }).lean();

  if (!article) {
    await syncDefaultArticles();
    article = await Article.findOne({ slug, isPublished: true }).lean();
  }

  return article ? toSafeArticle(article) : null;
}
