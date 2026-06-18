export const RESUME_PARSING_SKILLS_SECTION = `SKILLS — STRICT COPY ENGINE

You COPY skills verbatim. You do NOT interpret, normalize, group, regroup, rename, summarize, sample, or invent.

RULES:
- Use the EXACT category label from the resume — never rewrite (keep "AI/ML" as "AI/ML", keep "Programming Languages" as "Programming Languages", do not rewrite to "AI & ML" or "Languages").
- Never invent a category that is not visible in the resume (no "Other Skills", "Tools", "Misc" unless that exact label is in the resume).
- Never move a skill from one category to another.
- The output schema is a flat string array. To preserve grouping, every skill under a visible category MUST be emitted as "Exact Category: Exact Skill".
- Repeat the category prefix for every skill in that category. Do not emit only the first item with the category.
- Never emit "Category Skill" without the colon. "Languages TypeScript" is WRONG; "Languages: TypeScript" is correct.
- Emit EVERY skill in the resume's skills section, in the same order. If 12 skills are listed under one category, all 12 must appear.
- Never drop a skill because it looks similar to another. "React" and "React Native" are TWO distinct skills — emit both.
- Never deduplicate. If a skill appears twice in the resume, copy it twice.
- If the resume has no category labels, emit each skill as a plain string with no group prefix.

PREPROCESSING (before extracting):
- Spaced headers: "T E C H N I C A L  S K I L L S" → "TECHNICAL SKILLS"; "T E C H S T A C K & S K I L L S" → "TECH STACK & SKILLS".
- INLINE COLLISIONS (multi-column resumes only): if a single line shows "<skill> <Category Name>: ...", split BEFORE the new category. Example:
  Source line: "WebSockets AI & ML: LLM Integration"
  Split into:  "WebSockets" (under previous category) + "AI & ML: LLM Integration..." (new category)
  Only do this inside the skills section. Do NOT split job titles like "Senior Backend Engineer".

EXTRACTION:
- A category boundary can be either:
  1. "<label>:" followed by skills, OR
  2. a visible/bold label immediately followed by skills on the same line, even when PDF text extraction drops the colon.
- For label-only boundaries, peel off the exact visible label and treat the remaining text as skills. Example source: "Languages TypeScript, JavaScript" → ["Languages: TypeScript", "Languages: JavaScript"].
- Collect every comma-separated item after the category label until the next category or section header.
- Split items only on ",". Never split on "/", "&", or "(...)" — "Bash/Shell" and "AWS (Certified)" are single skills.
- Preserve exact wording, casing, and special characters; trim only leading/trailing whitespace.

OUTPUT FORMAT EXAMPLES:
- Source: "Languages TypeScript, JavaScript (ES2023+), Python 3"
  Output entries: "Languages: TypeScript", "Languages: JavaScript (ES2023+)", "Languages: Python 3"
- Source: "Data & AI / ML Apache Kafka, RabbitMQ, Airflow, dbt, Spark, Pandas, NumPy"
  Output entries: "Data & AI / ML: Apache Kafka", "Data & AI / ML: RabbitMQ", "Data & AI / ML: Airflow", "Data & AI / ML: dbt", "Data & AI / ML: Spark", "Data & AI / ML: Pandas", "Data & AI / ML: NumPy"
- Source: "DevOps & Cloud AWS (EC2, ECS, Lambda, S3, RDS, SQS, CloudFront), GCP (Cloud Run, BigQuery, GKE), Docker"
  Output entries: "DevOps & Cloud: AWS (EC2, ECS, Lambda, S3, RDS, SQS, CloudFront)", "DevOps & Cloud: GCP (Cloud Run, BigQuery, GKE)", "DevOps & Cloud: Docker"

COVERAGE CHECK before returning:
- Every visible category appears in your output under its exact label.
- Every visible skill inside each category appears in your output.
- If the source skills section has visible category labels, every output skill entry must contain ": ".
- Count: if the resume shows N skills, output ≥ N skill entries. If fewer → REPROCESS.
`;
