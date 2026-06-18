export const RESUME_PARSING_EDUCATION_SECTION = `EDUCATION

Output every visible education entry in source order. Each entry has degree, institution, year.
- Detect entries using patterns like "Degree, Field [Date]" or "Degree in Field" then "University Name".
- Recognize degree variants: B.Sc., Bachelor of Science, M.Sc., Master of Science, MBA, Ph.D., etc.
- Strong signals — "Bachelor", "Master", "University", "College" — classify the block as education, NEVER as work experience. If such signals appear, education MUST be extracted.
- Keep institution names intact (e.g. "University of Malta (UM)").
- year preserves the visible date or duration text for that entry.
- Do not confuse certifications or short courses with degrees.
- If grade or GPA is visible, keep it inside degree or institution (the schema has no dedicated field).`;
