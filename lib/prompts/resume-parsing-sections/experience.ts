export const RESUME_PARSING_EXPERIENCE_SECTION = `WORK EXPERIENCE — STRICT EXTRACTION

OUTPUT: every visible work-experience entry, in source order. Each entry has title, company, location, startDate, endDate, and description (array of strings).

DETECTION:
- A new entry starts at a role header. Common patterns:
  • "[Title] · [Company] [Date Range]"
  • "[Title] [Date Range]" then "[Company]" on the next line
  • "[Title]" then "[Company]" then "[Location]" then "[Date]"
  • Anything ending with a date range like "Jun 2024 – Present" or "Jan 2022 – Mar 2024"
- Count role headers FIRST. If you count 4, output 4 entries — never stop early.
- Continue across page breaks, repeated "EXPERIENCE" headings, and long bullet lists under earlier roles.
- Include all professional types: full-time, internship, freelance, contract, consulting.

CLASSIFICATION:
- Education blocks (containing "Bachelor", "Master", "B.Sc", "M.Sc", "MBA", "University", "College", "School") go in education, NOT experience.
- Work blocks (company + responsibility/accomplishment bullets) go in experience, NOT education.
- Never split a role title just because it contains "Backend", "Frontend", "AI", "Data", "Blockchain", etc. "Senior Backend Engineer" is ONE title.

DATES:
- Split inline date ranges into startDate and endDate.
- If endDate is "Present", keep it as "Present".
- Extract dates even when inline with the title, e.g. "Senior Software Engineer Jun 2025 – Mar 2026".

DESCRIPTION (bullets):
- description is an array; one bullet/accomplishment per item.
- Do not merge multiple bullets into one paragraph. Do not split one bullet into fragments.
- Each bullet must be a complete sentence — no mid-sentence cuts, no orphan tail fragments.
- Treat wrapped continuation lines as part of the same bullet, unless a new bullet marker or a new role header begins.
- Use role/company headers and date boundaries as hard stops: when the next role starts, end the current entry immediately. Never pull bullets from the next role into the previous one.
- If a role shows 6 visible bullets, return 6 description items.
- For paragraph-style accomplishment blocks with no visible bullet markers, still capture the detail text as description items.

INFERENCE:
- Pair title and company only from explicit nearby cues. Do not invent missing employers or titles. If a field is truly missing, leave that field empty for that entry only.
- Merge duplicate entries only when the resume clearly repeats the same role.

FORMATS HANDLED: one-column, sidebars + main column, multi-page PDFs, OCR text, role/company/date on one line, company on a separate line, location/work-mode on separate lines, paragraph-style accomplishments.`;
