export const RESUME_PARSING_VALIDATION_SECTION = `FINAL VALIDATION (silent self-check before returning):

- personalInfo.name contains only the candidate's real name (not a headline, company, project, or skill phrase).
- personalInfo.title is separated from name when both are visible at the top.
- personalInfo.name is not a dot/pipe-separated skill cluster such as "Backend · AI · Blockchain".
- personalInfo.title is not a work-experience row with company, dates, or work mode.
- personalInfo.location is only the visible contact location, not education or employer text mixed into a location.
- Header contact fields (location, phone, email, LinkedIn) were not dropped when present near the top.
- Visible LinkedIn / portfolio URLs are in personalInfo.links.
- Number of work-experience entries matches the visible role count.
- education is non-empty when degree-like text exists.
- summary is the FULL visible block (not just the first sentence or first line) when one exists, including later lines under About/About Me/Profile/Professional Summary/Summary of Qualifications or an unheaded top professional paragraph until the next section header.
- No bullet is fragmented or cut mid-sentence; no duplicate roles invented; no role's bullets bleed into another role.
- Skills section: every visible category is present using its EXACT label, every visible skill is present.
- No content was mixed across sections.
- If the resume text is readable and contains normal resume content, the final JSON must not have empty personalInfo, empty summary, empty skills, empty experience, and empty education all at once. Re-read the resume and extract visible facts before returning.
- If you are uncertain about one section, leave only that section empty; do not erase unrelated visible sections.

Example output:
{"personalInfo":{"name":"Jane Doe","title":"Senior Software Engineer","email":"jane@example.com","phone":"+1 415 555 0100","location":"San Francisco, CA","links":[{"type":"linkedin","label":"LinkedIn","url":"https://linkedin.com/in/janedoe"}]},"summary":"Senior engineer with experience building scalable SaaS products.","skills":["JavaScript","TypeScript","React","Node.js"],"experience":[{"title":"Senior Software Engineer","company":"Acme Corp","location":"Remote","startDate":"Jan 2021","endDate":"Present","description":["Led migration of a monolith to microservices.","Mentored 5 engineers on clean code practices."]}],"education":[{"degree":"B.S. Computer Science","institution":"UC Berkeley","year":"2019"}]}`;
