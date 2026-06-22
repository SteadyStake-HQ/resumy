import { RESUME_PARSING_EDUCATION_SECTION } from "@/lib/prompts/resume-parsing-sections/education";
import { RESUME_PARSING_EXPERIENCE_SECTION } from "@/lib/prompts/resume-parsing-sections/experience";
import { RESUME_PARSING_GENERAL_SECTION } from "@/lib/prompts/resume-parsing-sections/general";
import { RESUME_PARSING_NORMALIZATION_SECTION } from "@/lib/prompts/resume-parsing-sections/normalization";
import { RESUME_PARSING_SKILLS_SECTION } from "@/lib/prompts/resume-parsing-sections/skills";
import { RESUME_PARSING_VALIDATION_SECTION } from "@/lib/prompts/resume-parsing-sections/validation";

const HF_GENERAL_SECTION = RESUME_PARSING_GENERAL_SECTION.replace(
  '{"personalInfo":{"name":"","title":"","email":"","phone":"","location":"","links":[{"type":"","label":"","url":""}]},"summary":"","skills":[],"experience":[{"title":"","company":"","location":"","startDate":"","endDate":"","description":[]}],"education":[{"degree":"","institution":"","year":""}]}',
  '{"personalInfo":{"name":null,"title":null,"email":null,"phone":null,"location":null,"links":[{"type":"linkedin","label":"LinkedIn","url":"https://..."}]},"summary":null,"skills":[],"experience":[{"title":null,"company":null,"location":null,"startDate":null,"endDate":null,"description":[]}],"education":[{"degree":null,"institution":null,"year":null}]}',
);

const HF_SKILLS_OUTPUT_SHAPE = `SKILLS OUTPUT SHAPE — STRICT (overrides any earlier instruction):

"skills" is a FLAT JSON array of strings. Never an object map. Never nested objects. Never an array of {category, items}.

If the resume groups skills under categories, emit one string per skill in the form "<Category>: <Skill>" using the EXACT category label from the resume.
If the resume has no category labels, emit each skill as a plain string with no prefix.

COPY MODE — preserve the skill ↔ category relation exactly:
- Each skill stays under the SAME category it is printed under. Never move a skill to a different category, even if it seems to fit better.
- Use ONLY category labels literally printed in the resume. Never invent "Other", "Tools", "Additional", "Technical Skills", etc.
- Never add a skill that is not literally printed. Never expand abbreviations or add synonyms.
- Never deduplicate, never sample, never truncate a long list.
- A category label by itself is NOT a skill (do not emit "Languages" as a skill). A skill is never a category.

EVERY visible skill must appear, in the resume's order. If the resume shows 27 skills, the array must contain at least 27 skill strings. If you emit more than the resume lists, you invented something — fix it.

Correct:
  "skills": ["Languages: Python", "Languages: JavaScript", "Backend: Node.js"]
  "skills": ["Python", "JavaScript", "Node.js"]
Wrong:
  "skills": {"Languages": ["Python"]}                       ← object map
  "skills": [{"category": "Languages", "items": ["Python"]}] ← array of objects
  "skills": ["Languages: Python, JavaScript"]                ← multi-skill string
  "skills": ["Languages"]                                     ← category emitted as a skill
  "skills": ["DevOps: Docker"]  (when Docker was printed under "Languages") ← moved skill
  "skills": ["Tools: Git"]      (when no "Tools" category exists)           ← invented category
  "skills": []                                                ← empty when skills are present

MULTI-COLUMN RESUMES (CRITICAL):
Many resumes lay skills out in two side-by-side columns. After PDF text extraction, the columns merge onto the same lines. Treat each visible "<Category>:" header as a hard boundary — items that follow it belong to that category, not the previous one. Concrete example of source text you WILL see:

  Languages: JavaScript, TypeScript, Python   Cloud & DevOps: AWS, GCP, Docker
  Frontend: React.js, Next.js                 AI & ML: LLM Integration, RAG
  Backend: Node.js, Express.js                Blockchain & Web3: Solidity, DeFi
  Databases: PostgreSQL, MongoDB              Data Engineering: Apache Spark, Airflow

Correct extraction of the row above:
  "skills": [
    "Languages: JavaScript", "Languages: TypeScript", "Languages: Python",
    "Cloud & DevOps: AWS", "Cloud & DevOps: GCP", "Cloud & DevOps: Docker",
    "Frontend: React.js", "Frontend: Next.js",
    "AI & ML: LLM Integration", "AI & ML: RAG",
    "Backend: Node.js", "Backend: Express.js",
    "Blockchain & Web3: Solidity", "Blockchain & Web3: DeFi",
    "Databases: PostgreSQL", "Databases: MongoDB",
    "Data Engineering: Apache Spark", "Data Engineering: Airflow"
  ]

WRONG (do NOT do this):
  - Putting "AWS, GCP, Docker" under "Languages" because they appeared on the same physical line.
  - Splitting "Cloud & DevOps" into "Cloud &" and "DevOps" — those are NEVER separate categories.
  - Truncating "AI & ML" to "ML" or "Data Engineering" to "Engineering".
  - Inventing a "Languages: Cloud &" or "Languages: DevOps: AWS" prefix-stack.

When in doubt, the category boundary is the literal "<Category>:" pattern, where <Category> is a complete capitalized phrase from the resume (1–4 words, possibly joined by "&", "/", or spaces). Multi-word category labels like "Cloud & DevOps", "AI & ML", "Blockchain & Web3", "Data Engineering" must stay intact as a single unit.`;

const HF_JSON_RULES = `JSON RULES:
- First char { — last char } — nothing else ever
- Escape internal double-quotes as \\" and backslashes as \\\\
- No trailing commas, no comments, no undefined / NaN
- null for missing scalars, [] for missing arrays
- Before returning, silently verify that arrays and objects are balanced and that experience objects are separated by commas with no extra } characters between items.
- "skills" is a flat array of strings (see SKILLS OUTPUT SHAPE). Never an object map. Never an array of objects.`;

const HF_VALIDATION_SECTION = RESUME_PARSING_VALIDATION_SECTION.replace(
  /Example output:[\s\S]*$/,
  "",
).trim();

export const HF_RESUME_PARSING_SYSTEM_MESSAGE = [
  HF_GENERAL_SECTION,
  RESUME_PARSING_NORMALIZATION_SECTION,
  RESUME_PARSING_SKILLS_SECTION,
  HF_SKILLS_OUTPUT_SHAPE,
  RESUME_PARSING_EXPERIENCE_SECTION,
  RESUME_PARSING_EDUCATION_SECTION,
  HF_VALIDATION_SECTION,
  HF_JSON_RULES,
].join("\n\n");

/**
 * Builds the user-role message for HuggingFace resume parsing.
 * Only the raw resume text — instructions live in the system message.
 */
export function buildHuggingFaceParsingUserMessage(rawText: string): string {
  return `RESUME TEXT:\n${rawText.trim()}`;
}
