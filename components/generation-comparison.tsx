import { TailoredResumePreview } from "@/components/tailored-resume-preview";
import { PageIntro } from "@/components/ui/page-intro";
import type { SafeGeneration } from "@/lib/generation";
import type { ResumeComparisonSummary } from "@/lib/resume-comparison";

type GenerationComparisonProps = {
  leftGeneration: SafeGeneration;
  rightGeneration: SafeGeneration;
  comparison: ResumeComparisonSummary;
};

function SectionChecklist({
  sections,
}: {
  sections: ResumeComparisonSummary["left"]["sectionCompleteness"];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(sections).map(([label, ready]) => (
        <div
          key={label}
          className="flex items-center justify-between rounded-2xl border border-line bg-white/72 px-4 py-3"
        >
          <span className="text-sm font-medium capitalize text-foreground">
            {label}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
              ready
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {ready ? "Ready" : "Needs work"}
          </span>
        </div>
      ))}
    </div>
  );
}

function DifferenceList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <section className="dream-card p-5">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted"
            >
              {item}
            </span>
          ))
        ) : (
          <p className="text-sm leading-7 text-muted">No standout differences here.</p>
        )}
      </div>
    </section>
  );
}

export function GenerationComparison({
  leftGeneration,
  rightGeneration,
  comparison,
}: GenerationComparisonProps) {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Compare"
        title="Read two tailored generations side by side"
        description="Use the heuristic score, section coverage, and content differences below to decide which version tells the stronger story for the role."
        badge="Versions"
        aside={
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="soft-stat">
              <p className="eyebrow !text-[0.58rem] !tracking-[0.22em]">Version A</p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {leftGeneration.sourceResume?.fileName ?? "Tailored resume"}
              </p>
            </div>
            <div className="soft-stat">
              <p className="eyebrow !text-[0.58rem] !tracking-[0.22em]">Version B</p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {rightGeneration.sourceResume?.fileName ?? "Tailored resume"}
              </p>
            </div>
          </div>
        }
      />

      <section className="surface-card rounded-[2.2rem] p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-2">
          {[
            {
              generation: leftGeneration,
              diagnostics: comparison.left,
              label: "Version A",
            },
            {
              generation: rightGeneration,
              diagnostics: comparison.right,
              label: "Version B",
            },
          ].map(({ generation, diagnostics, label }) => (
            <section
              key={generation.id}
              className="dream-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-muted">
                    {label}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">
                    {generation.sourceResume?.fileName ?? "Tailored resume"}
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    {generation.jobDescription?.title || "Custom job description"}
                    {generation.jobDescription?.company
                      ? ` • ${generation.jobDescription.company}`
                      : ""}
                  </p>
                </div>

                <div className="rounded-[1.4rem] bg-[linear-gradient(145deg,#263552,#4c5b82)] px-5 py-4 text-white">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/60">
                    Heuristic score
                  </p>
                  <p className="mt-2 text-4xl font-semibold">{diagnostics.score}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-line bg-white/72 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Skills
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {diagnostics.snapshot.skills}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-white/72 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Experience bullets
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {diagnostics.snapshot.experienceBullets}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-white/72 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Education entries
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {diagnostics.snapshot.educationEntries}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <SectionChecklist sections={diagnostics.sectionCompleteness} />
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <DifferenceList
          title="Skills only in Version A"
          items={comparison.skillsOnlyInLeft}
        />
        <DifferenceList
          title="Skills only in Version B"
          items={comparison.skillsOnlyInRight}
        />
        <DifferenceList
          title="Roles only in Version A"
          items={comparison.rolesOnlyInLeft}
        />
        <DifferenceList
          title="Roles only in Version B"
          items={comparison.rolesOnlyInRight}
        />
      </section>

      <section className="surface-card rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              Structural observations
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              Summary changed: {comparison.summaryChanged ? "yes" : "no"}.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <DifferenceList
            title="Education only in Version A"
            items={comparison.educationOnlyInLeft}
          />
          <DifferenceList
            title="Education only in Version B"
            items={comparison.educationOnlyInRight}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <TailoredResumePreview
          data={leftGeneration.tailoredData}
          title="Version A details"
          subtitle="Read the full structured content for the first generation."
        />
        <TailoredResumePreview
          data={rightGeneration.tailoredData}
          title="Version B details"
          subtitle="Read the full structured content for the second generation."
        />
      </div>
    </div>
  );
}
