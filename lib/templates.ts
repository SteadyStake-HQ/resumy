import { promises as fs } from "fs";
import path from "path";
import { connectToDatabase } from "@/lib/db";
import {
  type SafeDesignTemplate,
  normalizeDesignTemplateConfig,
  toSafeDesignTemplate,
} from "@/lib/design-template";
import DesignTemplate from "@/models/DesignTemplate";

const TEMPLATE_ROOT = path.join(process.cwd(), "templates", "cvcraft");

export const BUILT_IN_TEMPLATE_SLUGS = [
  "modern",
  "classic",
  "minimal",
  "ats",
] as const;

type TemplateManifest = Omit<SafeDesignTemplate, "id">;

export type TemplateAssetBundle = {
  manifest: TemplateManifest;
  styleSource: string;
  templateSource: string;
};

function createTemplateQuery(idOrSlug: string) {
  if (/^[0-9a-fA-F]{24}$/.test(idOrSlug)) {
    return {
      $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
    };
  }

  return {
    slug: idOrSlug,
  };
}

async function loadTemplateManifestFromDisk(slug: string): Promise<TemplateManifest> {
  const configPath = path.join(TEMPLATE_ROOT, slug, "config.json");
  const rawConfig = await fs.readFile(configPath, "utf8");
  const parsedConfig = JSON.parse(rawConfig) as Record<string, unknown>;

  return {
    slug,
    name:
      typeof parsedConfig.name === "string" && parsedConfig.name.trim()
        ? parsedConfig.name.trim()
        : slug,
    description:
      typeof parsedConfig.description === "string"
        ? parsedConfig.description.trim()
        : "",
    thumbnailUrl:
      typeof parsedConfig.thumbnailUrl === "string" && parsedConfig.thumbnailUrl.trim()
        ? parsedConfig.thumbnailUrl.trim()
        : `/template-thumbnails/${slug}.svg`,
    engine:
      parsedConfig.engine === "yamlresume" ? "yamlresume" : "cvcraft",
    category:
      typeof parsedConfig.category === "string" && parsedConfig.category.trim()
        ? parsedConfig.category.trim()
        : "modern",
    config: normalizeDesignTemplateConfig(parsedConfig.config),
  };
}

export async function syncDesignTemplates() {
  await connectToDatabase();

  const manifests = await Promise.all(
    BUILT_IN_TEMPLATE_SLUGS.map((slug) => loadTemplateManifestFromDisk(slug)),
  );

  const templates = await Promise.all(
    manifests.map((manifest) =>
      DesignTemplate.findOneAndUpdate(
        { slug: manifest.slug },
        {
          slug: manifest.slug,
          name: manifest.name,
          description: manifest.description,
          thumbnailUrl: manifest.thumbnailUrl,
          engine: manifest.engine,
          category: manifest.category,
          config: manifest.config,
          isActive: true,
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        },
      ).lean(),
    ),
  );

  return templates.filter(Boolean).map((template) => toSafeDesignTemplate(template));
}

export async function listActiveDesignTemplates() {
  await connectToDatabase();

  let templates = await DesignTemplate.find({ isActive: true })
    .sort({ createdAt: 1, name: 1 })
    .lean();

  if (!templates.length) {
    await syncDesignTemplates();
    templates = await DesignTemplate.find({ isActive: true })
      .sort({ createdAt: 1, name: 1 })
      .lean();
  }

  return templates.map((template) => toSafeDesignTemplate(template));
}

export async function findDesignTemplate(idOrSlug: string) {
  await connectToDatabase();

  const query = createTemplateQuery(idOrSlug);
  let template = await DesignTemplate.findOne(query).lean();

  if (!template) {
    await syncDesignTemplates();
    template = await DesignTemplate.findOne(query).lean();
  }

  return template ? toSafeDesignTemplate(template) : null;
}

export async function loadTemplateAssetBundle(
  slug: string,
): Promise<TemplateAssetBundle> {
  const [manifest, styleSource, templateSource] = await Promise.all([
    loadTemplateManifestFromDisk(slug),
    fs.readFile(path.join(TEMPLATE_ROOT, slug, "style.css"), "utf8"),
    fs.readFile(path.join(TEMPLATE_ROOT, slug, "template.hbs"), "utf8"),
  ]);

  return {
    manifest,
    styleSource,
    templateSource,
  };
}
