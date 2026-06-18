import { createPrismaModel } from "@/lib/prisma-model";

export interface IArticle {
  title: string;
  slug: string;
  content: string;
  author: string;
  tags: string[];
  publishDate: Date;
  isPublished: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const Article = createPrismaModel({
  model: "article",
});

export default Article;
