import { readFileSync } from "node:fs";
import { Pool } from "pg";

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const env = readFileSync(".env", "utf8");
  const line = env
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("DATABASE_URL="));

  const value = line?.slice("DATABASE_URL=".length).trim();
  if (!value) {
    throw new Error("DATABASE_URL is required to push the Neon schema.");
  }

  return value;
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "nickname" TEXT NOT NULL DEFAULT '',
  "country" TEXT NOT NULL DEFAULT '',
  "membershipTier" TEXT NOT NULL DEFAULT 'free',
  "membershipStatus" TEXT NOT NULL DEFAULT 'active',
  "membershipStartedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "membershipExpiresAt" TIMESTAMPTZ,
  "membershipRequestedTier" TEXT,
  "membershipRequestStatus" TEXT NOT NULL DEFAULT 'none',
  "membershipRequestDate" TIMESTAMPTZ,
  "membershipRequestReason" TEXT NOT NULL DEFAULT '',
  "preferredAI" TEXT NOT NULL DEFAULT 'openai',
  "preferredGeminiRouterIndex" INTEGER NOT NULL DEFAULT 1,
  "preferredHuggingFaceRouterIndex" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Resume" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "fileName" TEXT NOT NULL,
  "originalUrl" TEXT,
  "rawText" TEXT NOT NULL DEFAULT '',
  "parsedData" JSONB NOT NULL,
  "analysisReport" JSONB NOT NULL,
  "extractionMeta" JSONB,
  "aiUsage" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "JobDescription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL DEFAULT '',
  "company" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL,
  "parsedKeywords" JSONB NOT NULL,
  "analyzedJobDescription" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Article" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "content" TEXT NOT NULL,
  "author" TEXT NOT NULL DEFAULT 'Resume Foundry',
  "tags" JSONB NOT NULL,
  "publishDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DesignTemplate" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "thumbnailUrl" TEXT,
  "engine" TEXT NOT NULL DEFAULT 'cvcraft',
  "category" TEXT NOT NULL DEFAULT 'modern',
  "config" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Generation" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sourceResumeId" TEXT NOT NULL REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "jobDescriptionId" TEXT REFERENCES "JobDescription"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "publicId" TEXT UNIQUE,
  "tailoredData" JSONB NOT NULL,
  "editorHtml" TEXT,
  "editorDocumentStyle" JSONB,
  "editorTemplateId" TEXT DEFAULT 'base',
  "aiModelUsed" TEXT NOT NULL DEFAULT 'openai',
  "designTemplateId" TEXT REFERENCES "DesignTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "customization" JSONB,
  "generatedFiles" JSONB NOT NULL,
  "aiUsage" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BackgroundTask" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" TEXT NOT NULL DEFAULT 'resume_analysis',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "title" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "stageKey" TEXT NOT NULL DEFAULT 'queued',
  "stageLabel" TEXT NOT NULL DEFAULT 'Queued',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "resultResumeId" TEXT,
  "resultGenerationId" TEXT,
  "replaceResumeId" TEXT,
  "tailoringPayload" JSONB,
  "debugData" JSONB,
  "sourceFileBuffer" BYTEA,
  "sourceFileMimeType" TEXT,
  "sourceFileSize" INTEGER,
  "events" JSONB NOT NULL,
  "processingToken" TEXT,
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BackgroundTaskLease" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "ownerToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CREATE TABLE IF NOT EXISTS does not add newly introduced fields to tables
-- that already exist. Keep additive schema changes explicit and idempotent.
ALTER TABLE "Resume" ADD COLUMN IF NOT EXISTS "aiUsage" JSONB;
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "aiUsage" JSONB;

CREATE INDEX IF NOT EXISTS "User_membershipRequestStatus_updatedAt_idx" ON "User"("membershipRequestStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "Resume_userId_createdAt_idx" ON "Resume"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobDescription_userId_createdAt_idx" ON "JobDescription"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Article_isPublished_publishDate_idx" ON "Article"("isPublished", "publishDate");
CREATE INDEX IF NOT EXISTS "DesignTemplate_isActive_idx" ON "DesignTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "Generation_userId_createdAt_idx" ON "Generation"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Generation_sourceResumeId_idx" ON "Generation"("sourceResumeId");
CREATE INDEX IF NOT EXISTS "Generation_jobDescriptionId_idx" ON "Generation"("jobDescriptionId");
CREATE INDEX IF NOT EXISTS "BackgroundTask_userId_createdAt_idx" ON "BackgroundTask"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "BackgroundTask_status_createdAt_idx" ON "BackgroundTask"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "BackgroundTask_type_status_idx" ON "BackgroundTask"("type", "status");
CREATE INDEX IF NOT EXISTS "BackgroundTaskLease_expiresAt_idx" ON "BackgroundTaskLease"("expiresAt");
`;

async function main() {
  const pool = new Pool({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query(schemaSql);
    process.stdout.write("Neon schema is up to date.\n");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Failed to push Neon schema. ${String(error)}\n`);
  process.exitCode = 1;
});
