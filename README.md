# Resume Foundry

Fantasy-soft, professional resume workspace built with Next.js 16.

## Experience

Resume Foundry blends a whimsical visual language with a serious application workflow:

- Upload and analyze source resumes
- Tailor resumes to job descriptions
- Preview and export polished PDF and DOCX versions
- Request premium access for comparison, sharing, cover letters, and the AI assistant
- Manage admin approvals from the same codebase

## Stack

- TypeScript
- Tailwind CSS v4
- Supabase Postgres + Prisma
- NextAuth credentials authentication
- Protected profile page
- Nickname and country management with flag display
- Resume upload, parsing, and analysis reports
- Job description input, tailored resume generation, and history
- Design templates, live preview, and PDF/DOCX export
- Membership approvals, comparison, cover letters, public links, and assistant chat

## Design System

- Heading font: `Fraunces`
- Body font: `Plus Jakarta Sans`
- Utility mono font: `IBM Plex Mono`
- Background: `#fff7fb`
- Foreground: `#24324a`
- Accent mint: `#65a89e`
- Accent peach: `#ffc5a6`
- Highlight lavender: `#c6bbff`
- Shared tokens live in [app/globals.css](/mnt/e/gitwork/resume/app/globals.css)

The redesign uses shared UI shells and control classes such as `page-hero`, `dream-card`, `button-primary`, `button-secondary`, `input-field`, and `status-banner` to keep page styling consistent.

## Environment variables

Create a local env file from `.env.example` and provide:

```bash
# Supabase Postgres connection string. Use the connection pooler (Supavisor)
# for serverless/Next.js — copy it from Supabase → Project Settings → Database →
# "Connection string" → "Transaction"/"Session" pooler, and fill in your DB password.
# Session pooler (port 5432) — recommended (supports prepared statements):
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
# Supabase API keys (only needed if you use the supabase-js client for
# storage/realtime/auth — the app's data layer connects via DATABASE_URL above):
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=replace-with-your-supabase-publishable-key
GEMINI_API_KEY=replace-with-your-gemini-api-key
OPENAI_API_KEY=replace-with-your-openai-api-key
# Prefer numbered tokens for router-based Hugging Face selection.
HF_TOKEN_1=replace-with-your-first-huggingface-token
HF_TOKEN_2=replace-with-your-second-huggingface-token
# Legacy single-token fallback:
HF_TOKEN=
HUGGINGFACE_MODEL=meta-llama/Llama-3.1-8B-Instruct:novita
ADMIN_EMAILS=admin1@example.com,admin2@example.com
NEXT_PUBLIC_BASE_URL=http://localhost:3000
TASK_INTERNAL_TOKEN=replace-with-a-long-random-internal-token
TASKIQ_BRIDGE_URL=http://127.0.0.1:8001
TASKIQ_AUTO_START=true
TASKIQ_REDIS_URL=redis://127.0.0.1:6379/0
TASKIQ_QUEUE_NAME=resume_analysis
TASKIQ_RESULT_EXPIRE_SECONDS=3600
TASK_INTERNAL_REQUEST_TIMEOUT_SECONDS=300
```

## Install and run

```bash
npm install
npm run prisma:generate
npm run db:push
npm run seed:templates
npm run seed:articles
npm run dev
```

Open `http://localhost:3000`.

Generated PDF and DOCX files are saved locally in `public/generated/<userId>/` during development.

## Background resume queue

Resume uploads now queue into a persisted background task list instead of blocking in a modal.

The project uses a hybrid model:

- Next.js owns upload APIs, Supabase Postgres task state, and the internal resume-processing route.
- A separate Python Taskiq worker owns Redis-backed job execution.
- A lightweight Python bridge accepts enqueue requests from Next.js and hands them to Taskiq.

`npm run dev` tries to auto-start the Taskiq bridge and worker when `TASKIQ_BRIDGE_URL` points to localhost and the Python sidecar dependencies are installed. Run `npm run taskiq:setup` once to create `.venv` and install the sidecar dependencies. Set `TASKIQ_AUTO_START=false` to disable that and use the in-process fallback only.

To install or run the Taskiq sidecar manually:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r taskiq_worker/requirements.txt
taskiq worker taskiq_worker.broker:broker taskiq_worker.tasks --workers 1 --max-async-tasks 1
uvicorn taskiq_worker.bridge:app --host 127.0.0.1 --port 8001
```

You also need a Redis instance running at `TASKIQ_REDIS_URL`.

If the Taskiq bridge is unavailable, the app falls back to a local in-process background runner so development still works.

## Notes

- AI provider calls are centralized in [lib/aiService.ts](/mnt/e/gitwork/resume/lib/aiService.ts) with Gemini, OpenAI, and Hugging Face support plus deterministic fallbacks where appropriate.
- Client-only app providers live in [components/app-client-providers.tsx](/mnt/e/gitwork/resume/components/app-client-providers.tsx), keeping toast and assistant state centralized without disabling server rendering for the page shell.
- Built-in design templates can be reseeded at any time with the scripts above.

## Available routes

- `/`
- `/auth/signup`
- `/auth/login`
- `/profile`
- `/retail`
- `/design`
- `/history`
- `/membership`
- `/compare`
- `/admin`
- `/public/[publicId]`
- `POST /api/auth/signup`
- `GET /api/user`
- `PUT /api/user/profile`
- `GET /api/resume`
- `GET /api/resume/[id]`
- `POST /api/resume/upload`
- `POST /api/resume/tailor`
- `GET /api/job-description`
- `POST /api/job-description`
- `GET /api/job-description/[id]`
- `POST /api/job-description/extract`
- `GET /api/generation`
- `GET /api/templates`
- `GET /api/templates/[id]`
- `GET /api/preview`
- `POST /api/generate`
- `POST /api/user/request-upgrade`
- `GET /api/admin/membership-requests`
- `POST /api/admin/handle-request`
- `GET /api/generation/compare`
- `POST /api/generation/[id]/share`
- `POST /api/cover-letter`
- `POST /api/cover-letter/pdf`
- `POST /api/assistant`

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run build
```

The build script uses webpack because the default Next.js 16 Turbopack build path exits early in this workspace environment, while the webpack build completes successfully.

Resume Foundry defaults AI features to OpenAI GPT-5.4, with Gemini and Hugging Face still available from the user's profile setting. If the selected provider is unavailable or its API key is missing, the upload, tailoring, cover-letter, and assistant flows fall back to deterministic local behavior instead of crashing.
