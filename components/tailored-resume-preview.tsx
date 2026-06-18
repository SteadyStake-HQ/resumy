import { memo } from "react";
import { formatLocationWithFlag } from "@/lib/location-display";
import type { ParsedResumeData } from "@/lib/resume";
import { groupResumeSkills } from "@/lib/resume-skills";

type TailoredResumePreviewProps = {
  data: ParsedResumeData;
  title?: string;
  subtitle?: string;
};

function TailoredResumePreviewComponent({
  data,
  title = "Tailored resume preview",
  subtitle = "A structured view of the generated resume content.",
}: TailoredResumePreviewProps) {
  const groupedSkills = groupResumeSkills(data.skills);

  return (
    <section className="surface-card rounded-[2.2rem] p-6 sm:p-8">
      <div className="space-y-3">
        <p className="eyebrow">Preview</p>
        <h2 className="font-[var(--font-fraunces)] text-4xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-muted">{subtitle}</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <section className="dream-card p-5">
            <h3 className="text-lg font-semibold text-foreground">Profile</h3>
            <div className="mt-4 space-y-2 text-sm text-muted">
              <p className="font-semibold text-foreground">
                {data.personalInfo.name || "Unnamed candidate"}
              </p>
              {data.personalInfo.title ? (
                <p className="font-medium text-foreground/80">
                  {data.personalInfo.title}
                </p>
              ) : null}
              {data.personalInfo.email ? <p>{data.personalInfo.email}</p> : null}
              {data.personalInfo.phone ? <p>{data.personalInfo.phone}</p> : null}
              {data.personalInfo.location ? (
                <p>{formatLocationWithFlag(data.personalInfo.location)}</p>
              ) : null}
            </div>
          </section>

          <section className="dream-card p-5">
            <h3 className="text-lg font-semibold text-foreground">Skills</h3>
            <div className="mt-4 grid gap-3">
              {groupedSkills.length ? (
                groupedSkills.map((group) => (
                  <div key={group.label} className="rounded-xl border border-line bg-white/80 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground">
                      {group.label}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.skills.map((skill, skillIndex) => (
                        <span
                          key={`${group.label}-${skill}-${skillIndex}`}
                          className="rounded-full border border-line bg-surface-soft px-2.5 py-1.5 text-[11px] font-semibold text-muted"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-muted">
                  No skills were returned for this generation.
                </p>
              )}
            </div>
          </section>

          <section className="dream-card p-5">
            <h3 className="text-lg font-semibold text-foreground">Education</h3>
            <div className="mt-4 space-y-3">
              {data.education.length ? (
                data.education.map((entry) => (
                  <div
                    key={`${entry.degree}-${entry.institution}-${entry.year}`}
                    className="rounded-2xl border border-line bg-white/72 px-4 py-3"
                  >
                    <p className="font-semibold text-foreground">
                      {entry.degree || "Education entry"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {entry.institution}
                      {entry.year ? ` • ${entry.year}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-muted">
                  No education entries were returned for this generation.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="dream-card p-5">
            <h3 className="text-lg font-semibold text-foreground">Summary</h3>
            <p className="mt-4 text-sm leading-8 text-muted">
              {data.summary || "No summary was returned for this generation."}
            </p>
          </section>

          <section className="dream-card p-5">
            <h3 className="text-lg font-semibold text-foreground">Experience</h3>
            <div className="mt-4 space-y-4">
              {data.experience.length ? (
                data.experience.map((entry) => (
                  <article
                    key={`${entry.title}-${entry.company}-${entry.startDate}-${entry.endDate}`}
                    className="rounded-[1.5rem] border border-line bg-white/72 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {entry.title || "Role"}
                        </p>
                        <p className="text-sm text-muted">
                          {[entry.company, formatLocationWithFlag(entry.location)]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                        {[entry.startDate, entry.endDate].filter(Boolean).join(" - ")}
                      </p>
                    </div>

                    <ul className="mt-4 space-y-2 text-sm leading-7 text-muted">
                      {entry.description.length ? (
                        entry.description.map((bullet) => (
                          <li key={bullet} className="rounded-2xl bg-background/65 px-3 py-2">
                            {bullet}
                          </li>
                        ))
                      ) : (
                        <li className="rounded-2xl bg-background/65 px-3 py-2">
                          No bullet points were returned for this role.
                        </li>
                      )}
                    </ul>
                  </article>
                ))
              ) : (
                <p className="text-sm leading-7 text-muted">
                  No experience entries were returned for this generation.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export const TailoredResumePreview = memo(TailoredResumePreviewComponent);
