export const RESUME_PARSING_NORMALIZATION_SECTION = `NORMALIZE & SPLIT SECTIONS

Before extracting:
- Collapse spaced headers and headlines: "A B O U T  M E" → "ABOUT ME", "P R O F E S S I O N A L  S U M M A R Y" → "PROFESSIONAL SUMMARY", "T E C H S T A C K & S K I L L S" → "TECH STACK & SKILLS", "W O R K  E X P E R I E N C E" → "WORK EXPERIENCE", "S e n i o r S o f t w a r e E n g i n e e r" → "Senior Software Engineer".
- Reconstruct wrapped lines into their original sentences and bullets. Lines starting with bullets, hyphens, or numbering are bullet items — merge wrapped continuation lines into the same bullet.

Recognize section headers (case-insensitive):
- SUMMARY: "SUMMARY", "Professional Summary", "Career Summary", "Profile Summary", "Summary of Qualifications", "Qualifications Summary", "Executive Summary", "Executive Profile", "Career Profile", "Professional Profile", "Professional Overview", "Profile", "About", "About Me", "Objective", "Overview", "Introduction", "Intro", "Personal Statement", "Background", including letter-spaced forms like "A B O U T  M E"
- UNHEADED SUMMARY: a 25+ word prose paragraph directly below the name/title/contact block and before the first real section can be summary even without a heading.
- WORK EXPERIENCE: "WORK EXPERIENCE", "Experience", "Professional Experience", "Employment", "Employment History", "Work History", "Career History", "Career Experience", "Relevant Experience", "Projects", "Professional Projects"
- EDUCATION: "EDUCATION", "Academic Background", "Academic History", "Qualifications", "Certifications", "Training"
- SKILLS: "SKILLS", "TECHNICAL SKILLS", "TECH STACK & SKILLS", "Tech Stack and Skills", "Core Skills", "Key Skills", "Technical Expertise", "Technologies", "Tech Stack", "Tools", "Competencies", "Expertise"

Each section's content lives only between its header and the next real section header — never mix content across sections.`;
