import type { Types } from "@/lib/id";
import { createPrismaModel } from "@/lib/prisma-model";
import type { DesignTemplateConfig } from "@/lib/design-template";

export interface IDesignTemplate {
  slug: string;
  name: string;
  description?: string;
  thumbnailUrl?: string | null;
  engine: "cvcraft" | "yamlresume";
  category?: string;
  config: DesignTemplateConfig;
  isActive: boolean;
  createdBy?: Types.ObjectId | string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const DesignTemplate = createPrismaModel({
  model: "designTemplate",
});

export default DesignTemplate;
