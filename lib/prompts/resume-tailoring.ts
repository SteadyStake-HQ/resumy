import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseJobDescriptionSummary,
  type AnalyzedJobDescription,
} from "@/lib/job-description";
import { clipResumePromptText } from "@/lib/prompts/prompt-utils";
import {
  normalizeAnalysisReport,
  normalizeParsedResumeData,
  type ParsedResumeData,
  type ResumeAnalysisReport,
} from "@/lib/resume";

const ROOT_TAILORING_PROMPT_PATH = join(process.cwd(), "tailoring_prompt.md");

// ── Pre-prompt skill sanitization ─────────────────────────────────────────────
// Removes garbage strings from the original resume's skills array BEFORE the
// data is serialised into the tailoring prompt.  These strings typically come
// from resume parsing artefacts: stray words extracted from bullet text rather
// than actual technology / tool / methodology names.
//
// Rules (applied in order):
//  1. Strip obvious English stopwords and common non-skill words.
//  2. Strip generic "__ Development / Programming / Engineering" phrases that
//     describe a category, not a specific technology.
//  3. Extract the technology name from verbose parenthetical formats:
//     "Front-End Development (React)" → "React"
//     "Back-End Development (Node.js, Express.js)" → ["Node.js", "Express.js"]
//  4. Drop anything that survives the above but is ≤ 2 chars and all lowercase
//     (e.g. bare "to", "of") — these are parsing fragments.
//
// The filter is intentionally conservative: it only removes strings that are
// clearly not skill names.  Valid short tech names ("Go", "R", "C#", "PHP",
// "Vue", "SQL", "CSS", "Git") are explicitly preserved.

const VALID_SHORT_TECHS = new Set([
  "go", "r", "c", "c#", "c++", "php", "sql", "css", "vue", "git", "svn",
  "aws", "gcp", "npm", "pip", "vim", "ios", "sdk", "api", "ai", "ml",
  "ui", "ux",
]);

// ── Garbage blocklist ─────────────────────────────────────────────────────────
// All keys must be the output of normSkillKey() — lowercase, spaces only.
// Both singular and plural forms are listed where the AI commonly produces both.
const GARBAGE_SKILL_NORMS = new Set([
  // ── English stopwords / parsing fragments ──────────────────────────────────
  "for", "and", "the", "in", "on", "of", "to", "a", "an", "with", "using",
  "use", "used", "by", "at", "as", "or", "it", "its", "be", "been",

  // ── Generic activity / practice words (describe WHAT you do, not the TOOL) ─
  "web", "software", "programming", "coding", "development", "engineering",
  "work", "working", "create", "creating", "build", "building",
  "design", "designing", "deploy", "deploying",
  "debug", "debugging",
  "refactor", "refactoring",
  "review", "reviews",
  "code review", "code reviews", "peer review", "peer reviews",
  "code quality", "clean code",
  "best practices", "best practice",
  "design pattern", "design patterns",
  "pair programming",

  // ── ML / data concepts that are not tools (name the tool instead) ─────────
  "inference",         // → use "TensorFlow Serving", "ONNX Runtime", etc.
  "regression",        // → use "scikit-learn", "linear regression model" is too vague
  "classification",    // → use "scikit-learn", "XGBoost", etc.
  "clustering",
  "prediction",
  "training",          // ML training — too generic
  "fine tuning",
  "fine-tuning",
  "model training",
  "feature engineering",
  "data preprocessing",
  "data analysis",     // → use pandas, NumPy, Spark, etc.
  "data processing",
  "data collection",
  "data management",
  "statistical analysis",
  "statistical modeling",
  "machine learning",  // valid in bullets but too generic as a standalone skill — use specific frameworks

  // ── Testing activities (use the testing framework name instead) ────────────
  "unit testing",
  "integration testing",
  "regression testing",
  "end to end testing",
  "e2e testing",
  "functional testing",
  "smoke testing",
  "acceptance testing",
  "performance testing",
  "load testing",
  "manual testing",
  "automated testing",  // → use Selenium, Cypress, Playwright, etc.
  "test automation",    // same
  "testing",            // alone — too generic
  "quality assurance",  // QA as a practice; "pytest" or "Selenium" are the skills

  // ── Generic capability / soft descriptors ─────────────────────────────────
  "experience", "knowledge", "ability", "abilities", "skills", "skill",
  "proficiency", "familiar", "familiarity", "understanding", "expertise",
  "critical thinking", "analytical skills", "analytical thinking",
  "problem solving", "communication", "teamwork", "collaboration",
  "leadership", "mentoring", "mentorship", "coaching",
  "decision making", "time management", "attention to detail",
  "project management", "product management",
  "documentation", "technical writing", "technical documentation",
  "sprint planning", "estimation", "story points", "standup",
  "research", "analysis",

  // ── Generic domain phrases (category names, not specific tools) ───────────
  "full stack", "full stack development", "full-stack development",
  "front end", "front-end", "back end", "back-end", "fullstack",
  "front end development", "back end development",
  "front-end development", "back-end development",
  "front end web development", "back end web development",
  "front-end web development", "back-end web development",
  "web application development", "software engineering", "web engineering",
  "application development", "mobile development",
  "cross platform development", "cross-platform development",

  // ── Paradigm descriptions (name the LANGUAGE where you apply them) ────────
  "object oriented", "object-oriented", "oop",
  "object oriented programming", "object-oriented programming",
  "functional programming", "procedural programming",
  "reactive programming",

  // ── Version control generic (use Git, SVN, Mercurial instead) ─────────────
  "version control", "source control", "source code management",
]);

// Matches the parenthetical-extraction pattern:
// "Front-End Development (React)" → captures "React"
// "Back-End Development (Node.js, Express.js)" → captures "Node.js, Express.js"
const VERBOSE_SKILL_RE = /^[^(]+\(([^)]+)\)\s*$/;

function normSkillKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function sanitizeSkillsForTailoring(skills: string[]): string[] {
  const result: string[] = [];

  for (const raw of skills) {
    if (!raw?.trim()) continue;

    // ── Step 1: Try verbose extraction "Category (Tech1, Tech2)" ──────────
    const match = VERBOSE_SKILL_RE.exec(raw.trim());
    if (match?.[1]) {
      const extracted = match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // Only use the extracted names; discard the outer category wrapper
      for (const tech of extracted) {
        const key = normSkillKey(tech);
        if (key.length >= 2 && !GARBAGE_SKILL_NORMS.has(key)) {
          result.push(tech);
        }
      }
      continue;
    }

    // ── Step 2: Check against garbage blocklist ────────────────────────────
    const key = normSkillKey(raw);
    if (GARBAGE_SKILL_NORMS.has(key)) continue;

    // ── Step 3: Reject very short all-lowercase fragments ─────────────────
    // e.g. "to", "of", "in" — but allow valid short tech names like "Go", "R"
    if (key.length <= 2 && !VALID_SHORT_TECHS.has(key)) continue;

    result.push(raw);
  }

  // ── Plural-aware deduplication ────────────────────────────────────────────
  // When we add "Code Review" we also reserve "Code Reviews" and vice-versa,
  // so whichever variant arrives second is silently dropped.
  const seen = new Set<string>();

  function addSeen(key: string) {
    seen.add(key);
    // Reserve the ±s plural variant for words long enough to avoid mangling
    // short tech names (e.g. "Redis" → don't drop "Redi").
    if (key.endsWith("s") && key.length > 5) {
      seen.add(key.slice(0, -1)); // "code reviews" → also reserve "code review"
    } else if (!key.endsWith("s") && key.length > 4) {
      seen.add(key + "s"); // "code review" → also reserve "code reviews"
    }
  }

  return result.filter((s) => {
    const k = normSkillKey(s);
    if (seen.has(k)) return false;
    addSeen(k);
    return true;
  });
}

const FALLBACK_RESUME_TAILORING_INSTRUCTIONS = `You are an expert resume tailoring system, senior technical recruiter, and ATS optimization specialist.
Tailor the candidate's whole resume to the provided job description, not only the first section.

CRITICAL GLOBAL RULES
1. Preserve truthfulness. Do not invent companies, employers, dates, schools, degrees, certifications, locations, profile links, unsupported seniority, unsupported achievements, or unsupported metrics.
2. Preserve identity and contact data. Every available original profile/contact field must appear in the tailored output: full name, email, phone, location, LinkedIn, GitHub, portfolio, website, personal site, and other profile links. Never drop contact links just because the job description does not mention them.
3. Tailor every work experience. Each original role must receive a tailored role title and rewritten bullets with job-description-relevant wording while preserving company, dates, and location.
4. Do not shift work experience data. The first original experience maps to sourceIndex 0, the second to sourceIndex 1, and so on. Keep every role attached to its original company and dates.
5. Regenerate Skills deeply from original skills, technologies in experience/projects, and the job description. Add job-description skills only when supported by the original resume or clearly related background.

PROFILE RULES
- Generate profile.roleTitle aligned with the job description, believable from the original resume, professional, concise, and 3-7 words.
- ALWAYS output a roleTitle that differs from the original candidate title — do not copy the original verbatim. If the original is "Software Developer" and the JD says "Software Engineer", output "Software Engineer". If the original is "Full Stack Developer" and the JD says "Full-Stack Engineer", output "Full-Stack Engineer". A profile.roleTitle identical to the original is a tailoring failure — fix it.
- Use seniority only if supported by the original experience.
- Preserve all original contact fields and links. Put missing link categories as empty strings or [].

SUMMARY RULES
- Rewrite the summary completely. Do not copy or lightly paraphrase the original summary.
- COMPANY NAME PROHIBITION: Do NOT mention any specific company, employer, or organization by name anywhere in the summary. The summary is a positioning statement for the TARGET role — company names belong only in the work experience section. "Having worked at Acme Corp..." or "After 3 years at Google..." in the summary is a critical error. Remove all employer references.
- Length: 4-5 compact but substantial sentences, roughly 75-110 words when the resume has enough source detail.
- Make the summary technology-focused and evidence-rich. It must read like a senior technical positioning statement, not a generic career overview.
- Include the target role or closest truthful role framing in sentence 1.
- Weave in 5-8 high-priority JD keywords naturally, including exact-match technologies when supported by the resume.
- Emphasize the strongest relevant stacks, architecture patterns, product/system domains, delivery practices, and impact themes while remaining truthful.
- Name concrete supported technologies or technical areas from the resume, for example frontend frameworks, backend services, APIs, cloud/devops, data/AI, testing, observability, blockchain, or databases when relevant.
- Connect technical breadth to business/product outcomes using supported qualitative evidence when metrics are unavailable.
- Avoid first-person pronouns and generic filler such as "passionate", "hard-working", "results-driven individual", or "proven track record" without evidence.

SKILL VALIDATION RULES (apply BEFORE placing any skill)
A VALID skill is ONLY: a named programming language (Go, Python, TypeScript, PHP, Java, C#, Ruby), framework/library (React, Vue.js, Django, Spring Boot, Rails), database (PostgreSQL, MySQL, MongoDB, Redis), cloud/infra tool (AWS, Docker, Kubernetes, Terraform), CI/CD tool (GitHub Actions, Jenkins), protocol/methodology (REST, GraphQL, gRPC, Agile, TDD, microservices), or AI/ML tool (TensorFlow, PyTorch, LangChain). If a term is not immediately recognisable as one of these specific technology/tool/methodology names, discard it.
AN INVALID skill — discard silently:
- Role or seniority words — these are job titles, not skills: developer, engineer, senior, junior, lead, principal, staff, architect, manager, intern, specialist, consultant, analyst, programmer, designer, scientist, researcher, expert, professional
- Experience-duration phrases: any phrase containing "years", "experience", "expertise" (e.g. "5+ years of Java experience", "10 years experience in Python", "expertise in Node.js")
- Plain English words that are not technology names: for, with, and, or, business, solution, system, service, platform, product, process, application, software, team, project, client, customer, company, performance, quality, delivery, agile (when used as an adjective, not Agile methodology)
- Activities: Code Review, Code Reviews, Peer Review, Refactoring, Debugging alone, Deploying, Programming, Coding, Build, Design
- Testing activities (use framework name instead): Unit Testing, Integration Testing, Regression Testing, Performance Testing, Test Automation, Testing alone
- ML/data concepts (use tool name instead): Inference, Regression, Classification, Clustering, Prediction, Training, Feature Engineering, Data Analysis, Statistical Analysis
- Category descriptions: Software Development, Web Development, Front-End Development, Back-End Development, Full-Stack Development, Object-Oriented Programming, OOP, Version Control
- Soft descriptors: Problem Solving, Communication, Teamwork, Leadership, Mentoring, Critical Thinking, Analytical Skills, Documentation
- Near-duplicates: Code Review and Code Reviews are the same — keep only one; same for any singular/plural pair
VERBOSE EXTRACTION: "Front-End Development (React)" → "React" only. "Back-End Development (Node.js, Express.js)" → "Node.js" + "Express.js". Discard the outer wrapper.
CORRECT PLACEMENT: Drupal/WordPress → Backend or CMS & Frameworks. jQuery → Frontend. Jest/pytest → Testing. Redis → Databases. Docker → DevOps & Cloud.

MANDATORY SKILLS TAILORING RULES
HARD LIMITS (never exceed):
- TARGET 5-6 skill groups. Hard maximum 7. Fewer, richer groups beat more, thinner ones.
- Maximum 12 items per group (ceiling only — never pad to reach it). Drop lowest-priority items if a group exceeds 12.
- Total items: include only genuine, relevant skills. Do not pad to hit any count.

PRUNING RULES (apply first):
- Omit entire groups with zero connection to the target role. Golang/Python backend JD → drop Blockchain & Web3, Mobile, Design & UI.
- Keep a group only if ≥ 2 of its items appear in the JD required/preferred/ATS keywords, OR the group covers a direct role responsibility.
- NEVER create "Additional Skills", "Other Skills", "Miscellaneous", "General", "Technical Skills", "Soft Skills", or any catch-all group. Every group must have a specific, meaningful technical domain label.

GROUP STRUCTURE:
- Output skills as grouped objects: [{ "label": "", "items": [] }].
- Build 3-4 primary groups directly serving the JD. Add 1-2 supporting groups only when clearly relevant.
- Good group names: Languages, Backend, Frontend, AI & ML, Databases, DevOps & Cloud, CI/CD & Tooling, Testing, Monitoring, Mobile, Security, Architecture, Data Engineering, CMS & Frameworks.
- When groups are too thin to stand alone, merge them into the closest named group.

ORDERING RULES:
- Lead with the group most central to the JD. Order remaining groups by JD emphasis.
- JD priority ladder: required skills → atsKeywords/priorityKeywords → preferred skills → supported strengths.
- Items inside each group: exact JD-required terms first, then adjacent skills. Never alphabetize.
- Do not duplicate skills across groups. Treat singular/plural variants as the same skill.
- technicalSkillPlan is separate from experienceKeywordPlan: Skills may contain only concrete technical names. Experience keywords may include delivery themes such as debugging, refactoring, collaboration, reliability, scale, and code review, but those themes must never become skill chips/groups.
- Do not output soft/process groups such as Additional Skills, Leadership Skills, Methodologies, Soft Skills, Professional Skills, or Qualifications.

ALL-ROLE TAILORING MANDATE
- EVERY role must receive meaningful tailoring — not just the most recent one.
- Identify 5-8 JD themes and distribute them across all roles based on what each role actually did.
- Most recent role: 4-5 JD themes, heaviest ATS keyword density.
- Older roles: 2-3 JD themes each, foundational evidence, career progression story.
- The resume must read as a coherent narrative where EVERY company contributes qualification evidence.
- Anti-pattern: rich specific bullets in the latest role + generic half-rewritten bullets in every other role. Fix this.
- SURFACE TAILORING IS PROHIBITED: synonym-swapping ("Developed" → "Engineered"), adjective padding ("robust, scalable"), or keyword appending without context/outcome are NOT meaningful tailoring. Every bullet must re-frame the actual work through the JD lens with context + action + stack + result.
- TEST FOR EACH BULLET: does it PROVE the candidate can do what the JD needs, or does it just MENTION a keyword? If it only mentions the keyword, rewrite it with substance.

WORK EXPERIENCE RULES
- Every original work experience must appear in source order with the same sourceIndex.
- Preserve company, location, startDate, and endDate exactly from the original resume.
- originalRoleTitle must be the original title. tailoredRoleTitle must be smoothly adjusted toward the target job vocabulary while staying truthful.
- Tailored role titles should be subtle and credible, usually changing 1-3 words.
- Do not make every tailoredRoleTitle identical. Do not falsely upgrade seniority.
- Every work experience must have 5-7 bullets. Minimum 5. Never 4 or fewer.
- Rewrite every bullet. Do not copy original bullets or lightly paraphrase them.
- Every bullet: context, action, named tool/stack, outcome. 18-32 words. No weak bullets.
- Every role needs at least 2 bullets that prove JD requirements through concrete past work.
- Use exact ATS keywords from the JD in bullets when supported by the original resume.
- Do not fake unsupported technologies. Use closest truthful adjacent experience instead.
- Never invent percentages, user counts, dollar values, or team sizes not in the original resume.

PROJECTS RULES
- Tailor projects if present in the source data. If no project data is present, return [].
- Preserve truthful project names and technologies. Do not invent users, revenue, funding, or unsupported metrics.
- Prefer 2-4 bullets for important projects.

EDUCATION AND CERTIFICATION RULES
- Preserve school, degree, field, dates, and location from the original resume when available.
- Do not invent or embellish certifications. If none are present, return [].

EXPERIENCE MAPPING SAFETY CHECK
- tailoringNotes.experienceMappingCheck must include one object per work experience.
- Verify companyPreserved, datesPreserved, roleTailored, and bulletCount for each sourceIndex.
- workExperience.length MUST equal the original resume's experience count. If the original resume has 4 roles, return 4 tailored roles. If it has 5 roles, return 5 tailored roles.
- Validation fails when only sourceIndex 0/latest role is tailored. Every sourceIndex must show meaningful title/bullet tailoring.

STYLE RULES
- Professional, modern, active voice. Human and natural, not AI-sounding.
- Avoid "leveraged cutting-edge", "seamlessly", repeated "robust and scalable", "utilized" overuse, "demonstrated expertise", "played a pivotal role", "synergy", and excessive adjectives.
- The resume must sound naturally relevant, not artificially keyword-stuffed.

JSON OUTPUT RULES
- Return only valid JSON. First char { and last char }.
- No markdown, comments, prose, trailing commas, undefined, NaN, or explanation outside JSON.
- Use exactly this top-level schema:
{"profile":{"fullName":"","roleTitle":"","email":"","phone":"","location":"","linkedin":"","github":"","portfolio":"","website":"","otherLinks":[]},"summary":"","skills":[{"label":"","items":[]}],"workExperience":[{"sourceIndex":0,"company":"","originalRoleTitle":"","tailoredRoleTitle":"","location":"","startDate":"","endDate":"","bullets":[]}],"projects":[{"name":"","description":"","technologies":[],"bullets":[]}],"education":[{"school":"","degree":"","field":"","location":"","startDate":"","endDate":"","details":[]}],"certifications":[],"tailoringNotes":{"targetRole":"","jobFocus":"","technicalSkillPlan":[],"experienceKeywordPlan":[],"topRequiredSkills":[],"topPreferredSkills":[],"skillsAddedFromJobDescription":[],"skillsRemovedAsLessRelevant":[],"experienceMappingCheck":[{"sourceIndex":0,"originalCompany":"","tailoredCompany":"","companyPreserved":true,"datesPreserved":true,"roleTailored":true,"bulletCount":5}],"warnings":[]}}`;

let cachedResumeTailoringInstructions: string | null = null;

function compactOriginalResumeContextForPrompt(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const rawText = typeof record.rawText === "string" ? record.rawText.trim() : "";

  return {
    fileName: record.fileName ?? "",
    analysisReport: record.analysisReport ?? null,
    extractionMeta: record.extractionMeta ?? null,
    rawTextExcerpt: rawText ? rawText.slice(0, 6000) : "",
    rawTextTruncated: Boolean(record.rawTextTruncated) || rawText.length > 6000,
  };
}

export function getResumeTailoringInstructions() {
  if (cachedResumeTailoringInstructions !== null) {
    return cachedResumeTailoringInstructions;
  }

  try {
    const filePrompt = readFileSync(ROOT_TAILORING_PROMPT_PATH, "utf8").trim();
    cachedResumeTailoringInstructions =
      filePrompt || FALLBACK_RESUME_TAILORING_INSTRUCTIONS;
  } catch {
    cachedResumeTailoringInstructions = FALLBACK_RESUME_TAILORING_INSTRUCTIONS;
  }

  return cachedResumeTailoringInstructions;
}

export const RESUME_TAILORING_INSTRUCTIONS = getResumeTailoringInstructions();

/**
 * Builds a compact "targeting brief" section that surfaces the most
 * actionable signals from the JD analysis directly before the prompt
 * inputs.  This primes the model's attention on what matters most before
 * it reads the full resume + JD text.
 */
function buildTargetingBrief(analyzedJd: AnalyzedJobDescription): string {
  const lines: string[] = ["=== TARGETING BRIEF (extracted from JD analysis — use this to drive decisions) ==="];

  if (analyzedJd.roleTitle) {
    lines.push(`Target role: ${analyzedJd.roleTitle}`);
  }
  if (analyzedJd.seniorityLevel) {
    lines.push(`Seniority: ${analyzedJd.seniorityLevel}`);
  }
  if (analyzedJd.coreHiringProblem) {
    lines.push(`Core hiring problem: ${analyzedJd.coreHiringProblem}`);
  }
  if (analyzedJd.companySignal) {
    lines.push(`Company type: ${analyzedJd.companySignal}`);
  }
  if (analyzedJd.department) {
    lines.push(`Department/function: ${analyzedJd.department}`);
  }
  if (analyzedJd.mission) {
    lines.push(`Mission context: ${analyzedJd.mission}`);
  }

  const required = analyzedJd.requiredSkills.slice(0, 8);
  if (required.length) {
    lines.push(`Must-have skills: ${required.join(", ")}`);
  }

  const technicalEnvironment = [
    ...analyzedJd.technicalEnvironment,
    ...analyzedJd.technicalEnvironmentDetails.languages,
    ...analyzedJd.technicalEnvironmentDetails.frameworks,
    ...analyzedJd.technicalEnvironmentDetails.tools,
    ...analyzedJd.technicalEnvironmentDetails.methodologies,
  ].filter(Boolean);
  if (technicalEnvironment.length) {
    lines.push(`Technical environment priority order: ${[...new Set(technicalEnvironment)].slice(0, 18).join(", ")}`);
  }

  const atsPhrases = analyzedJd.atsKeywords?.slice(0, 10) ?? [];
  if (atsPhrases.length) {
    lines.push(`ATS exact-match phrases (use verbatim in summary/bullets): ${atsPhrases.join(" | ")}`);
  }

  const aboveFold = analyzedJd.aboveTheFoldPriorities?.slice(0, 5) ?? [];
  if (aboveFold.length) {
    lines.push(`Above-the-fold priorities (must appear in summary + first role): ${aboveFold.join(", ")}`);
  }

  const bulletTerms = analyzedJd.atsAnalysis?.resumeBulletKeywords?.slice(0, 12) ?? [];
  if (bulletTerms.length) {
    lines.push(`Bullet keyword targets (use in work experience where truthful): ${bulletTerms.join(", ")}`);
  }

  if (analyzedJd.tailoringGuidance?.length) {
    lines.push(`Tailoring guidance: ${analyzedJd.tailoringGuidance.slice(0, 3).join(" | ")}`);
  }
  if (analyzedJd.executionSignals?.length) {
    lines.push(`Execution signals: ${analyzedJd.executionSignals.slice(0, 5).join(", ")}`);
  }
  if (analyzedJd.resumeTailoringGuidance?.emphasizeAchievements?.length) {
    lines.push(
      `Achievements to surface: ${analyzedJd.resumeTailoringGuidance.emphasizeAchievements.slice(0, 4).join(", ")}`,
    );
  }

  lines.push("=== END TARGETING BRIEF ===");
  return lines.join("\n");
}

export function buildResumeTailoringPrompt(
  resumeData: ParsedResumeData,
  jobDescription: string,
  context: {
    analyzedJobDescription?: AnalyzedJobDescription;
    resumeAnalysisReport?: ResumeAnalysisReport;
    originalResumeContext?: unknown;
  } = {},
) {
  // Sanitize skills BEFORE serialising — removes garbage parsing artefacts so
  // the AI never sees strings like "for", "development", "web", "debugging".
  const sanitizedResume = {
    ...normalizeParsedResumeData(resumeData),
    skills: sanitizeSkillsForTailoring(normalizeParsedResumeData(resumeData).skills),
  };
  const compactResume = JSON.stringify(sanitizedResume);
  const originalResumeContext = context.originalResumeContext
    ? JSON.stringify(compactOriginalResumeContextForPrompt(context.originalResumeContext))
    : "";
  const analyzedJd = context.analyzedJobDescription ?? parseJobDescriptionSummary(jobDescription);
  const parsedJobDescription = JSON.stringify(analyzedJd);
  const resumeAnalysis = context.resumeAnalysisReport
    ? JSON.stringify(normalizeAnalysisReport(context.resumeAnalysisReport))
    : "";

  // Build the targeting brief only when we have a rich AI-analyzed JD
  // (it has atsKeywords/aboveTheFoldPriorities that local parsing lacks).
  const targetingBrief = context.analyzedJobDescription
    ? buildTargetingBrief(context.analyzedJobDescription)
    : "";

  return [
    getResumeTailoringInstructions(),
    "",
    ...(targetingBrief ? [targetingBrief, ""] : []),
    // ── Anti-copy reminder injected immediately before the data ────────────
    // Placed here so it sits between instructions and resume data, making it
    // the last instruction the model reads before processing content.
    "=== ANTI-COPY REQUIREMENT (checked automatically after you respond) ===",
    "profile.roleTitle MUST differ from the original candidate title — if they are identical strings, it is a tailoring failure.",
    "The summary MUST contain zero company/employer names — positioning statement only, no work history narrative.",
    "Every bullet you write MUST be completely new text — not a copy or near-copy of any original bullet.",
    "The summary MUST be entirely new text — not a paraphrase of the original summary.",
    "A diff check is run: if any tailored bullet shares >4 consecutive normalized words with any original bullet, it fails.",
    "=== END ANTI-COPY REQUIREMENT ===",
    "",
    "RESUME JSON:",
    compactResume,
    "",
    ...(originalResumeContext
      ? ["FULL SELECTED RESUME CONTEXT JSON:", originalResumeContext, ""]
      : []),
    ...(resumeAnalysis ? ["ORIGINAL RESUME ANALYSIS JSON:", resumeAnalysis, ""] : []),
    "PARSED JOB DESCRIPTION JSON:",
    parsedJobDescription,
    "",
    "JOB DESCRIPTION:",
    clipResumePromptText(jobDescription),
  ].join("\n");
}

export function buildResumeTailoringUserMessage(
  resumeData: ParsedResumeData,
  jobDescription: string,
  context: {
    analyzedJobDescription?: AnalyzedJobDescription;
    resumeAnalysisReport?: ResumeAnalysisReport;
    originalResumeContext?: unknown;
  } = {},
) {
  const normalized = normalizeParsedResumeData(resumeData);
  const compactResume = JSON.stringify({
    ...normalized,
    skills: sanitizeSkillsForTailoring(normalized.skills),
  });
  const analyzedJd = context.analyzedJobDescription ?? parseJobDescriptionSummary(jobDescription);
  const parsedJobDescription = JSON.stringify(analyzedJd);
  const originalResumeContext = context.originalResumeContext
    ? `\n\nFULL SELECTED RESUME CONTEXT JSON:\n${JSON.stringify(compactOriginalResumeContextForPrompt(context.originalResumeContext))}`
    : "";
  const resumeAnalysis = context.resumeAnalysisReport
    ? `\n\nORIGINAL RESUME ANALYSIS JSON:\n${JSON.stringify(normalizeAnalysisReport(context.resumeAnalysisReport))}`
    : "";
  const targetingBrief = context.analyzedJobDescription
    ? `\n\n${buildTargetingBrief(context.analyzedJobDescription)}`
    : "";

  const antiCopy = `\n\n=== ANTI-COPY REQUIREMENT ===\nprofile.roleTitle MUST differ from the original candidate title — identical title is a tailoring failure.\nThe summary MUST contain zero company/employer names — it is a positioning statement, not a work history narrative.\nEvery bullet MUST be completely new text — not a copy or paraphrase of any original bullet.\nThe summary MUST be entirely new text — not a paraphrase of the original summary.\n=== END ANTI-COPY REQUIREMENT ===`;

  return `${targetingBrief}${antiCopy}\n\nRESUME JSON:\n${compactResume}${originalResumeContext}${resumeAnalysis}\n\nPARSED JOB DESCRIPTION JSON:\n${parsedJobDescription}\n\nJOB DESCRIPTION:\n${clipResumePromptText(jobDescription)}`.trimStart();
}

const HUGGINGFACE_RESUME_TAILORING_INSTRUCTIONS = `You are a resume tailoring engine. Return ONLY valid JSON.

Your output MUST be a tailored version of the original resume. It must not be a copy of the original.

OUTPUT SCHEMA - use exactly this app-native JSON shape:
{"personalInfo":{"name":"","title":"","email":"","phone":"","location":"","links":[{"type":"","label":"","url":""}]},"summary":"","skills":[],"experience":[{"title":"","company":"","location":"","startDate":"","endDate":"","description":[]}],"education":[{"degree":"","institution":"","year":""}]}

NON-NEGOTIABLE PRESERVATION RULES
- Preserve personalInfo.name, email, phone, location, and links exactly when present.
- Preserve every original experience entry in the same order.
- Preserve each experience company, location, startDate, and endDate exactly.
- Preserve education facts exactly.
- Do not invent employers, dates, schools, degrees, certifications, links, metrics, or unsupported technologies.

NON-NEGOTIABLE TAILORING RULES
- Rewrite summary into 4-5 new, technically rich sentences targeted to the job description. It must be meaningfully different from the original summary.
- The summary must include target role framing, 5-8 natural JD keywords, supported technologies from the resume, architecture/system context, delivery strengths, and outcome-oriented positioning.
- Avoid thin summaries that only mention collaboration, ownership, communication, or generic delivery style without concrete technical substance.
- Reorder skills and skill groups by JD priority order: required skills first, then ATS/priority keywords, above-the-fold priorities, technical skills, preferred skills, then secondary strengths.
- Skills must be concrete technologies/platforms/tools only. Never include process or ability labels such as Code Review, Agile/Scrum, End-to-End Ownership, Scalability, Performance Optimization, Cross-Functional Collaboration, Leadership Skills, Additional Skills, or Methodologies.
- Rewrite each experience title smoothly toward the target role when truthful; avoid exaggerated or identical titles across roles.
- Rewrite every experience description bullet. Do not copy original bullets. Keep truthful facts and supported metrics, but change wording, ordering, and emphasis toward the job.
- Preserve every original experience entry in the same order. If the original has N roles, output exactly N experience entries.
- Do not tailor only the first/latest role. Each role needs at least two meaningfully rewritten bullets when the source role has enough bullet content.
- Each role's bullets must include the most important JD keywords that are supported by that role's real work, showing past qualification through concrete company experience.
- Every experience that originally has 2+ bullets should return at least 5 tailored bullets when enough source facts exist.
- Each rewritten bullet should combine context, action, relevant skill/tool/theme, and outcome in one rich sentence.
- Reorder and regroup skills by job relevance. Include original relevant skills and job-description skills only when supported by the resume.

VALIDATION TARGETS YOU MUST SATISFY
- summaryChanged must be true: summary cannot match or lightly paraphrase the original.
- changedBulletCount must be at least 2.
- changedTitleCount should be at least 1 when experience exists and a truthful title adjustment is possible.
- skillsChanged should be true through relevance ordering, grouping, or supported additions.
- Do not return the original resume unchanged. If you cannot tailor a field, keep only that field stable and tailor the rest.

STYLE
- Professional, natural, ATS-aware, specific, active voice.
- Avoid generic filler, buzzword stuffing, and unsupported claims.
- No markdown. No explanation. First character must be { and last character must be }.`;

export function getHuggingFaceResumeTailoringInstructions() {
  return HUGGINGFACE_RESUME_TAILORING_INSTRUCTIONS;
}

export function buildHuggingFaceResumeTailoringUserMessage(
  resumeData: ParsedResumeData,
  jobDescription: string,
  context: {
    analyzedJobDescription?: AnalyzedJobDescription;
    resumeAnalysisReport?: ResumeAnalysisReport;
    originalResumeContext?: unknown;
  } = {},
) {
  const normalizedHf = normalizeParsedResumeData(resumeData);
  const compactResume = JSON.stringify({
    ...normalizedHf,
    skills: sanitizeSkillsForTailoring(normalizedHf.skills),
  });
  const parsedJobDescription = JSON.stringify(
    context.analyzedJobDescription ?? parseJobDescriptionSummary(jobDescription),
  );
  const targetingBrief = context.analyzedJobDescription
    ? `\n\n${buildTargetingBrief(context.analyzedJobDescription)}`
    : "";
  const originalResumeContext = context.originalResumeContext
    ? `\n\nFULL SELECTED RESUME CONTEXT JSON:\n${JSON.stringify(compactOriginalResumeContextForPrompt(context.originalResumeContext))}`
    : "";
  const resumeAnalysis = context.resumeAnalysisReport
    ? `\n\nORIGINAL RESUME ANALYSIS JSON:\n${JSON.stringify(normalizeAnalysisReport(context.resumeAnalysisReport))}`
    : "";

  const antiCopy = `\n\n=== ANTI-COPY REQUIREMENT ===\nprofile.roleTitle MUST differ from the original candidate title. The summary MUST have zero company/employer names. Every bullet MUST be completely new text. The summary MUST be entirely new text.\n=== END ANTI-COPY REQUIREMENT ===`;

  return `${targetingBrief}${antiCopy}\n\nRESUME JSON:\n${compactResume}${originalResumeContext}${resumeAnalysis}\n\nPARSED JOB DESCRIPTION JSON:\n${parsedJobDescription}\n\nJOB DESCRIPTION:\n${clipResumePromptText(jobDescription)}`.trimStart();
}
