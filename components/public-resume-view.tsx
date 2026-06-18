import type { SafeGeneration } from "@/lib/generation";
import { formatLocationWithFlag } from "@/lib/location-display";
import { groupResumeSkills } from "@/lib/resume-skills";

type PublicResumeViewProps = {
  generation: SafeGeneration;
};

export function PublicResumeView({ generation }: PublicResumeViewProps) {
  const accentColor = generation.customization?.accentColor ?? "#0f766e";
  const fontFamily = generation.customization?.fontFamily ?? "Arial, sans-serif";
  const resume = generation.tailoredData;
  const groupedSkills = groupResumeSkills(resume.skills);
  const contactItems = [
    resume.personalInfo.email,
    resume.personalInfo.phone,
    formatLocationWithFlag(resume.personalInfo.location),
  ].filter(Boolean);

  return (
    <article
      className="mx-auto max-w-5xl rounded-[2.3rem] border border-white/76 bg-white/92 p-8 shadow-[0_30px_70px_-44px_rgba(91,96,139,0.34)] sm:p-12"
      style={{ fontFamily }}
    >
      <header
        className="border-b pb-6"
        style={{ borderColor: `${accentColor}33` }}
      >
        <p
          className="text-sm font-semibold uppercase tracking-[0.28em]"
          style={{ color: accentColor }}
        >
          Public resume
        </p>
        <h1 className="mt-3 font-[var(--font-fraunces)] text-5xl font-semibold text-foreground">
          {resume.personalInfo.name || "Candidate"}
        </h1>
        {resume.personalInfo.title ? (
          <p className="mt-2 text-lg font-semibold text-foreground/80">
            {resume.personalInfo.title}
          </p>
        ) : null}
        {contactItems.length ? (
          <p className="mt-3 text-sm text-muted">{contactItems.join(" • ")}</p>
        ) : null}
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.34fr_0.66fr]">
        <aside className="space-y-8">
          {resume.summary ? (
            <section>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em]"
                style={{ color: accentColor }}
              >
                Summary
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">{resume.summary}</p>
            </section>
          ) : null}

          {groupedSkills.length ? (
            <section>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em]"
                style={{ color: accentColor }}
              >
                Skills
              </h2>
              <div className="mt-4 grid gap-3">
                {groupedSkills.map((group) => (
                  <div
                    key={group.label}
                    className="rounded-xl border p-3"
                    style={{
                      borderColor: `${accentColor}33`,
                      backgroundColor: `${accentColor}0f`,
                    }}
                  >
                    <p
                      className="text-[11px] font-black uppercase tracking-[0.18em]"
                      style={{ color: accentColor }}
                    >
                      {group.label}
                    </p>
                    <p className="mt-1 text-sm leading-7 text-foreground">
                      {group.skills.join(" • ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {resume.education.length ? (
            <section>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em]"
                style={{ color: accentColor }}
              >
                Education
              </h2>
              <div className="mt-4 space-y-4">
                {resume.education.map((entry) => (
                  <article key={`${entry.degree}-${entry.institution}-${entry.year}`}>
                    <p className="text-sm font-semibold text-foreground">{entry.degree}</p>
                    <p className="mt-1 text-sm text-muted">
                      {entry.institution}
                      {entry.year ? ` • ${entry.year}` : ""}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <section>
          <h2
            className="text-sm font-semibold uppercase tracking-[0.24em]"
            style={{ color: accentColor }}
          >
            Experience
          </h2>
          <div className="mt-4 space-y-6">
            {resume.experience.map((entry) => (
              <article key={`${entry.title}-${entry.company}-${entry.startDate}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {entry.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {entry.company}
                      {entry.location
                        ? ` • ${formatLocationWithFlag(entry.location)}`
                        : ""}
                    </p>
                  </div>
                  <p className="text-sm text-muted">
                    {entry.startDate}
                    {entry.endDate ? ` - ${entry.endDate}` : ""}
                  </p>
                </div>
                {entry.description.length ? (
                  <ul className="mt-3 space-y-2">
                    {entry.description.map((bullet) => (
                      <li
                        key={bullet}
                        className="rounded-2xl border border-line bg-background/60 px-4 py-3 text-sm leading-7 text-muted"
                      >
                        {bullet}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}
