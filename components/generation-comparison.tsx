import Link from "next/link";
import { TailoredResumePreview } from "@/components/tailored-resume-preview";
import { formatAIUsageCost } from "@/lib/ai-usage";
import type { SafeGeneration } from "@/lib/generation";
import type { ResumeComparisonSummary } from "@/lib/resume-comparison";

type GenerationComparisonProps = {
  leftGeneration: SafeGeneration;
  rightGeneration: SafeGeneration;
  comparison: ResumeComparisonSummary;
};

const C = {
  paper: "#fbf8f3",
  paperWarm: "#f5efe6",
  line: "#e7dece",
  ink: "#25221f",
  muted: "#756d63",
  sage: "#6c8f6f",
  sageSoft: "#dce9d8",
  peach: "#f4a373",
  peachSoft: "#ffe6d2",
};

function versionName(generation: SafeGeneration) {
  return generation.jobDescription?.title || generation.sourceResume?.fileName || "Tailored resume";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 12, background: "#fff" }}>
      <p style={{ margin: 0, color: C.muted, fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", fontFamily: "monospace" }}>{label}</p>
      <p style={{ margin: "5px 0 0", color: C.ink, fontSize: 19, fontWeight: 750 }}>{value}</p>
    </div>
  );
}

function VersionCard({
  generation,
  diagnostics,
  label,
  accent,
}: {
  generation: SafeGeneration;
  diagnostics: ResumeComparisonSummary["left"];
  label: string;
  accent: "sage" | "peach";
}) {
  const color = accent === "sage" ? C.sage : C.peach;
  const soft = accent === "sage" ? C.sageSoft : C.peachSoft;
  const completeness = Object.entries(diagnostics.sectionCompleteness);

  return (
    <article style={{ border: `1px solid ${C.line}`, borderRadius: 20, padding: 18, background: C.paper, boxShadow: "0 8px 24px rgba(60,40,20,.055)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: "inline-flex", padding: "4px 9px", borderRadius: 999, background: soft, color: C.ink, fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", fontFamily: "monospace" }}>{label}</span>
          <h2 style={{ margin: "9px 0 0", color: C.ink, fontSize: 20, lineHeight: 1.2, fontWeight: 750 }}>{versionName(generation)}</h2>
          <p style={{ margin: "5px 0 0", color: C.muted, fontSize: 12.5 }}>
            {generation.jobDescription?.company || "Custom role"} · {generation.aiModelUsed}
          </p>
        </div>
        <div style={{ minWidth: 80, padding: "10px 12px", textAlign: "center", borderRadius: 15, background: color, color: "#fff" }}>
          <p style={{ margin: 0, fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "monospace" }}>Score</p>
          <p style={{ margin: 0, fontSize: 29, lineHeight: 1.2, fontWeight: 800 }}>{diagnostics.score}</p>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
        <Metric label="Skills" value={diagnostics.snapshot.skills} />
        <Metric label="Bullets" value={diagnostics.snapshot.experienceBullets} />
        <Metric label="Education" value={diagnostics.snapshot.educationEntries} />
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {completeness.map(([section, ready]) => (
          <span key={section} style={{ padding: "5px 8px", borderRadius: 999, background: ready ? C.sageSoft : C.peachSoft, color: ready ? "#4f7152" : "#8d5b31", fontSize: 10.5, fontWeight: 650, textTransform: "capitalize" }}>
            {ready ? "✓" : "○"} {section}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 15, paddingTop: 13, borderTop: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: C.muted, fontSize: 11, fontFamily: "monospace" }}>
        <span>{generation.aiUsage ? `${generation.aiUsage.totalTokens.toLocaleString()} tokens · ${formatAIUsageCost(generation.aiUsage.estimatedCostUsd)}` : "Usage unavailable"}</span>
        <Link href={`/tailor/editor/${generation.id}`} style={{ color: C.ink, fontWeight: 700, textDecoration: "none" }}>Open editor →</Link>
      </div>
    </article>
  );
}

function DifferenceCard({ title, items, tone }: { title: string; items: string[]; tone: "sage" | "peach" }) {
  return (
    <section style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, background: "rgba(255,255,255,.72)" }}>
      <h3 style={{ margin: 0, color: C.ink, fontSize: 13, fontWeight: 750 }}>{title}</h3>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.length ? items.map((item) => (
          <span key={item} style={{ padding: "6px 9px", borderRadius: 999, background: tone === "sage" ? C.sageSoft : C.peachSoft, color: C.ink, fontSize: 10.5, fontWeight: 600 }}>{item}</span>
        )) : <span style={{ color: C.muted, fontSize: 12 }}>No unique items in this section.</span>}
      </div>
    </section>
  );
}

export function GenerationComparison({ leftGeneration, rightGeneration, comparison }: GenerationComparisonProps) {
  const scoreDelta = comparison.left.score - comparison.right.score;

  return (
    <div style={{ display: "grid", gap: 14, padding: 12 }}>
      <section style={{ padding: "18px 20px", border: `1px solid ${C.line}`, borderRadius: 20, background: `linear-gradient(135deg,${C.paper},${C.paperWarm})`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: C.peach, fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", fontFamily: "monospace" }}>Side-by-side review</p>
          <h1 style={{ margin: "6px 0 0", color: C.ink, fontSize: 24, fontWeight: 780, fontFamily: "var(--font-kaisei-tokumin), serif" }}>Two stories. One clearer choice.</h1>
          <p style={{ margin: "5px 0 0", color: C.muted, fontSize: 13 }}>Compare structure, role alignment, and content—not just the score.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ padding: "7px 11px", borderRadius: 999, background: scoreDelta === 0 ? C.paperWarm : C.sageSoft, color: C.ink, fontSize: 11.5, fontWeight: 700 }}>
            {scoreDelta === 0 ? "Scores are tied" : `${scoreDelta > 0 ? "A" : "B"} leads by ${Math.abs(scoreDelta)} points`}
          </span>
          <Link href="/history" style={{ padding: "7px 11px", border: `1px solid ${C.line}`, borderRadius: 999, color: C.ink, background: "#fff", fontSize: 11.5, fontWeight: 700, textDecoration: "none" }}>Change selection</Link>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
        <VersionCard generation={leftGeneration} diagnostics={comparison.left} label="Version A" accent="sage" />
        <VersionCard generation={rightGeneration} diagnostics={comparison.right} label="Version B" accent="peach" />
      </section>

      <section style={{ border: `1px solid ${C.line}`, borderRadius: 20, padding: 18, background: C.paper }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, color: C.muted, fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", fontFamily: "monospace" }}>Content delta</p>
            <h2 style={{ margin: "5px 0 0", color: C.ink, fontSize: 19, fontWeight: 750 }}>What each version emphasizes</h2>
          </div>
          <span style={{ padding: "5px 9px", borderRadius: 999, background: comparison.summaryChanged ? C.sageSoft : C.paperWarm, color: C.ink, fontSize: 10.5, fontWeight: 700 }}>Summary {comparison.summaryChanged ? "changed" : "unchanged"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 9 }}>
          <DifferenceCard title="Skills only in A" items={comparison.skillsOnlyInLeft} tone="sage" />
          <DifferenceCard title="Skills only in B" items={comparison.skillsOnlyInRight} tone="peach" />
          <DifferenceCard title="Roles only in A" items={comparison.rolesOnlyInLeft} tone="sage" />
          <DifferenceCard title="Roles only in B" items={comparison.rolesOnlyInRight} tone="peach" />
          <DifferenceCard title="Education only in A" items={comparison.educationOnlyInLeft} tone="sage" />
          <DifferenceCard title="Education only in B" items={comparison.educationOnlyInRight} tone="peach" />
        </div>
      </section>

      <details style={{ border: `1px solid ${C.line}`, borderRadius: 20, background: C.paper, overflow: "hidden" }}>
        <summary style={{ padding: "16px 18px", cursor: "pointer", color: C.ink, fontSize: 14, fontWeight: 750 }}>Inspect full resume content</summary>
        <div style={{ padding: "0 14px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
          <TailoredResumePreview data={leftGeneration.tailoredData} title="Version A details" subtitle="Full structured content for the first generation." />
          <TailoredResumePreview data={rightGeneration.tailoredData} title="Version B details" subtitle="Full structured content for the second generation." />
        </div>
      </details>
    </div>
  );
}
