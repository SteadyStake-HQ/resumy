"use client";

import { useEffect, useState } from "react";
import ReactCountryFlag from "react-country-flag";
import { StatusBanner } from "@/components/ui/status-banner";
import { useToast } from "@/components/ui/toast-provider";
import {
  formatLocationWithFlag,
  getLocationDisplayData,
} from "@/lib/location-display";
import { PROFILE_THEME as PROF } from "@/lib/profile-theme";
import type { SafeResume } from "@/lib/resume";
import { formatAIUsageCost } from "@/lib/ai-usage";

type AnalysisReportModalProps = {
  resume: SafeResume | null;
  onClose: () => void;
};

const PERSONAL_INFO_LABELS = {
  name: "Name",
  title: "Title",
  email: "Email",
  phone: "Phone",
  location: "Location",
};

const SKILL_GROUPS = [
  {
    label: "Languages",
    pattern:
      /\b(?:javascript|typescript|python|java|solidity|sql|nosql|bash|shell|go|golang|rust|c\+\+|c#|php|ruby|swift|kotlin)\b/i,
  },
  {
    label: "Frontend",
    pattern:
      /\b(?:react(?:\.js)?|next(?:\.js)?|tailwind|html5|css3|html|css|websockets?|vite|webpack|redux|vue|angular)\b/i,
  },
  {
    label: "Backend",
    pattern:
      /\b(?:node(?:\.js)?|express(?:\.js)?|fastify|rest\s+apis?|graphql|microservices|nestjs|django|flask|spring)\b/i,
  },
  {
    label: "AI & ML",
    pattern:
      /\b(?:llm|ai\s+agents?|rag|langchain|llamaindex|machine\s+learning|deep\s+learning|ml|nlp|openai|gemini|anthropic|vector\s+(?:dbs?|databases?))\b/i,
  },
  {
    label: "Blockchain & Web3",
    pattern:
      /\b(?:ethereum|evm|smart\s+contracts?|defi|hardhat|foundry|ipfs|web3|blockchain)\b/i,
  },
  {
    label: "Data Engineering",
    pattern:
      /\b(?:apache\s+spark|spark|airflow|dbt|etl|data\s+warehousing|data\s+engineering|warehouse|pipelines?)\b/i,
  },
  {
    label: "Databases",
    pattern:
      /\b(?:postgresql|postgres|mongo(?:db)?|redis|bigquery|elasticsearch|mysql|sqlite|dynamodb)\b/i,
  },
  {
    label: "CI/CD & Tooling",
    pattern:
      /\b(?:ci\/cd|github\s+actions|gitlab\s+ci|jenkins|circleci|webpack|vite|eslint|prettier)\b/i,
  },
  {
    label: "Cloud & DevOps",
    pattern:
      /\b(?:aws|gcp|azure|docker|kubernetes|terraform|vercel|netlify|cloudflare|devops)\b/i,
  },
  {
    label: "Monitoring",
    pattern:
      /\b(?:grafana|datadog|sentry|elk\s+stack|prometheus|logging|monitoring)\b/i,
  },
  {
    label: "Testing",
    pattern:
      /\b(?:jest|rspec|mocha|cypress|playwright|testing|unit\s+tests?|integration\s+tests?|hardhat\s+test\s+suites?)\b/i,
  },
  {
    label: "Methodologies",
    pattern:
      /\b(?:agile|scrum|tdd|ddd|microservices|rest|event-driven|architecture)\b/i,
  },
];

// Colour palette cycled across skill groups
const GROUP_PALETTE = [
  {
    cardBg: `linear-gradient(135deg, ${PROF.pendingBg}55, ${PROF.surface})`,
    cardBorder: PROF.pendingEdge,
    label: PROF.pendingInk,
    tagBg: PROF.surface,
    tagBorder: PROF.pendingEdge,
    tagText: PROF.pendingInk,
  },
  {
    cardBg: `linear-gradient(135deg, ${PROF.completedBg}66, ${PROF.surface})`,
    cardBorder: PROF.completedEdge,
    label: PROF.completedInk,
    tagBg: PROF.surface,
    tagBorder: PROF.completedEdge,
    tagText: PROF.completedInk,
  },
  {
    cardBg: `linear-gradient(135deg, ${PROF.actionBg}66, ${PROF.surface})`,
    cardBorder: PROF.actionEdge,
    label: PROF.actionInk,
    tagBg: PROF.surface,
    tagBorder: PROF.actionEdge,
    tagText: PROF.actionInk,
  },
];

function getScoreSummary(score: number) {
  if (score >= 85) return "Strong ATS readiness";
  if (score >= 70) return "Competitive with a few gaps";
  if (score >= 55) return "Partly ATS-friendly, but uneven";
  return "Needs a stronger ATS rewrite";
}

function getReadabilitySummary(score: number) {
  if (score >= 85) return "Easy to scan quickly";
  if (score >= 70) return "Mostly clear, minor dense spots";
  if (score >= 55) return "Readable but likely too wordy";
  return "Hard to skim in recruiter time";
}

function SectionLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: color || PROF.inkSoft,
        fontFamily: 'var(--font-ibm-plex-mono), monospace',
      }}
    >
      {children}
    </div>
  );
}

function SoftCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        padding: 18,
        background: `linear-gradient(180deg, ${PROF.surface}, ${PROF.surfaceSoft})`,
        border: `1.5px solid ${PROF.line}`,
        borderRadius: 18,
        boxShadow: "0 16px 34px -26px rgba(46,38,64,0.18)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function SectionActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${disabled ? PROF.line : PROF.actionEdge}`,
        background: disabled ? PROF.surfaceSoft : PROF.actionBg,
        color: disabled ? PROF.inkMute : PROF.actionInk,
        borderRadius: 999,
        padding: "5px 10px",
        fontSize: 10.5,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: 'var(--font-ibm-plex-mono), monospace',
      }}
    >
      {label}
    </button>
  );
}

function hasKnownSkillSignal(skill: string) {
  return SKILL_GROUPS.some((g) => g.pattern.test(skill)) || /[.+#/]/.test(skill);
}

function isDisplayableSkill(skill: string) {
  const s = stripSkillGroupPrefix(skill).skill;
  if (!s) return false;
  const words = s.split(/\s+/).length;
  if (words > 6) return false;
  if (words >= 5 && !hasKnownSkillSignal(s)) return false;
  return true;
}

function stripSkillGroupPrefix(skill: string) {
  const normalizedSkill = skill.trim();
  const match = normalizedSkill.match(/^([^:]{2,48}):\s*(.+)$/);

  if (!match) {
    return {
      group: "",
      skill: normalizedSkill,
    };
  }

  return {
    group: match[1].trim(),
    skill: match[2].trim(),
  };
}

function groupResumeSkills(skills: string[]) {
  const explicitGroups: Array<{ label: string; skills: string[] }> = [];
  const inferredGroups = SKILL_GROUPS.map((g) => ({ ...g, skills: [] as string[] }));
  const additional = { label: "Additional skills", pattern: /$a/, skills: [] as string[] };

  const appendSkill = (
    target: { label: string; skills: string[] },
    value: string,
  ) => {
    if (
      !target.skills.some(
        (existingSkill) => existingSkill.toLowerCase() === value.toLowerCase(),
      )
    ) {
      target.skills.push(value);
    }
  };

  for (const skill of skills) {
    const outer = stripSkillGroupPrefix(skill);

    if (!outer.skill) {
      continue;
    }

    // Unwrap double-nested prefixes: "GroupA: GroupB: Skill" → group="GroupB", skill="Skill".
    // This happens when a weak AI model writes e.g. "Blockchain: Data Eng.: Apache Spark"
    // instead of correctly emitting "Data Eng.: Apache Spark" as its own entry.
    const inner = outer.group ? stripSkillGroupPrefix(outer.skill) : null;
    const group = inner?.group || outer.group;
    const displaySkill = inner?.group ? inner.skill : outer.skill;

    if (!displaySkill) {
      continue;
    }

    if (group) {
      let explicitGroup = explicitGroups.find(
        (item) => item.label.toLowerCase() === group.toLowerCase(),
      );

      if (!explicitGroup) {
        explicitGroup = { label: group, skills: [] };
        explicitGroups.push(explicitGroup);
      }

      appendSkill(explicitGroup, displaySkill);

      continue;
    }

    if (explicitGroups.length) {
      continue;
    }

    const inferredTarget =
      inferredGroups.find((candidate) => candidate.pattern.test(displaySkill)) ??
      additional;
    const explicitTarget = explicitGroups.find(
      (candidate) =>
        candidate.label.toLowerCase() === inferredTarget.label.toLowerCase(),
    );

    if (explicitTarget) {
      appendSkill(explicitTarget, displaySkill);
    } else {
      appendSkill(inferredTarget, displaySkill);
    }
  }

  if (explicitGroups.length) {
    return explicitGroups.filter((group) => group.skills.length);
  }

  return [...explicitGroups, ...inferredGroups, additional].filter(
    (group) => group.skills.length,
  );
}

function normalizeWorkMode(value: string) {
  if (/\bremote\b/i.test(value)) {
    return "Remote";
  }

  if (/\bhybrid\b/i.test(value)) {
    return "Hybrid";
  }

  if (/\b(?:on[\s-]?site|onsite|in[\s-]?office)\b/i.test(value)) {
    return "On-site";
  }

  return "";
}

function stripWorkMode(value: string) {
  return value
    .replace(/\b(?:remote|hybrid|on[\s-]?site|onsite|in[\s-]?office)\b/gi, "")
    .replace(/\s*(?:·|•|\||-)\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getExperienceMetaChips(entry: SafeResume["parsedData"]["experience"][number]) {
  const chips: Array<{
    label: string;
    value: string;
    tone: "company" | "location" | "mode" | "date";
  }> = [];

  if (entry.company) {
    chips.push({ label: "Company", value: entry.company, tone: "company" });
  }

  const rawLocationParts = entry.location
    .split(/\s*(?:·|•|\|)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const locationParts = rawLocationParts.length ? rawLocationParts : [entry.location.trim()].filter(Boolean);
  const workMode =
    locationParts.map(normalizeWorkMode).find(Boolean) ||
    normalizeWorkMode(entry.location);
  const locationValue = locationParts
    .map((part) => stripWorkMode(part))
    .filter(Boolean)
    .join(" · ");

  if (locationValue) {
    chips.push({
      label: "Location",
      value: formatLocationWithFlag(locationValue),
      tone: "location",
    });
  }

  if (workMode) {
    chips.push({ label: "Mode", value: workMode, tone: "mode" });
  }

  if (entry.startDate || entry.endDate) {
    chips.push({
      label: "Dates",
      value: `${entry.startDate || "?"} – ${entry.endDate || "?"}`,
      tone: "date",
    });
  }

  return chips;
}

function getPlainImprovementTips(resume: SafeResume, score: number) {
  const reportTips = resume.analysisReport.tips
    .map((tip) => tip.trim())
    .filter(Boolean);

  if (reportTips.length) {
    return reportTips.slice(0, 5);
  }

  const tips: string[] = [];
  const bulletCount = resume.parsedData.experience.reduce(
    (total, entry) => total + entry.description.length,
    0,
  );
  const hasNumbers = [
    resume.parsedData.summary,
    ...resume.parsedData.experience.flatMap((entry) => entry.description),
  ].some((value) => /\b\d+(?:[.,]\d+)?(?:%|\+|x)?\b/.test(value));

  if (!resume.parsedData.summary) {
    tips.push("Add two or three lines at the top that say what you do best and what kind of role you want next.");
  }

  if (resume.parsedData.skills.length < 6) {
    tips.push("Add the main tools, platforms, and skills recruiters would search for in your target job.");
  }

  if (!hasNumbers) {
    tips.push("Add a few numbers where you can, such as team size, speed, savings, revenue, users, or project scale.");
  }

  if (bulletCount < 4) {
    tips.push("Give your recent roles a few more clear bullets: what you owned, what changed, and why it mattered.");
  }

  if (!resume.parsedData.personalInfo.links.length) {
    tips.push("Add a LinkedIn, GitHub, portfolio, or personal site if it helps prove your work.");
  }

  if (!tips.length && score < 90) {
    tips.push("Match your summary and skills more closely to the job post, using the same simple words where they truly fit.");
    tips.push("Start each important bullet with an action, then end with the result or impact.");
  }

  return tips.slice(0, 5);
}

export function AnalysisReportModal({
  resume,
  onClose,
}: AnalysisReportModalProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [openResumeId, setOpenResumeId] = useState<string | null>(null);
  const [isReextracting, setIsReextracting] = useState(false);
  const { showErrorToast } = useToast();

  // Lock scroll + ESC close
  useEffect(() => {
    if (!resume) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, resume]);

  if (!resume) return null;

  const reextractResume = async () => {
    if (isReextracting) {
      return;
    }

    setIsReextracting(true);

    try {
      const response = await fetch(`/api/resume/${resume.id}/reextract`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        task?: { id?: string };
        error?: string;
      };

      if (!response.ok || !payload.task) {
        throw new Error(payload.error ?? "Resume re-extraction failed.");
      }

      window.dispatchEvent(new CustomEvent("task-queue:highlight"));
      onClose();
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Resume re-extraction failed.",
        { title: "Re-extract failed" },
      );
    } finally {
      setIsReextracting(false);
    }
  };

  const score = Math.max(0, Math.min(100, resume.analysisReport.score));
  const readabilityScore = Math.max(0, Math.min(100, resume.analysisReport.readabilityScore));
  const formattedDate = resume.createdAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(resume.createdAt))
    : "Unknown date";

  const personalInfoEntries = (Object.keys(PERSONAL_INFO_LABELS) as Array<keyof typeof PERSONAL_INFO_LABELS>)
    .map((key) => ({
      key,
      label: PERSONAL_INFO_LABELS[key],
      value: resume.parsedData.personalInfo[key].trim(),
    }));
  const visiblePersonalInfoEntries = personalInfoEntries.filter((entry) =>
    Boolean(entry.value),
  );
  const profileLinks = resume.parsedData.personalInfo.links ?? [];
  const improvementTips = getPlainImprovementTips(resume, score);

  const totalBullets = resume.parsedData.experience.reduce((t, e) => t + e.description.length, 0);
  const hasMetrics = [resume.parsedData.summary, ...resume.parsedData.experience.flatMap((e) => e.description)]
    .some((v) => /\b\d+(?:[.,]\d+)?(?:%|\+|x)?\b/.test(v));

  const visibleSkills = resume.parsedData.skills.filter(isDisplayableSkill);
  const groupedSkills = groupResumeSkills(visibleSkills);
  const visibleEducation = resume.parsedData.education.slice(0, 3);

  const activeIdx = openResumeId === resume.id ? openIdx : null;
  const shouldShowImprovementTips = score < 90 && improvementTips.length > 0;

  const statChips = [
    {
      label: "ATS score",
      value: score,
      copy: getScoreSummary(score),
      tone: "deep" as const,
    },
    {
      label: "Readability",
      value: readabilityScore,
      copy: getReadabilitySummary(readabilityScore),
      tone: "running" as const,
    },
    {
      label: "Bullets",
      value: totalBullets,
      copy: hasMetrics ? "Metrics found ✦" : "Add metrics",
      tone: "pending" as const,
    },
    {
      label: "Gaps",
      value: resume.analysisReport.missingKeywords.length,
      copy: "Keyword checks",
      tone: "failed" as const,
    },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(46,38,64,0.4)",
        backdropFilter: "blur(8px)",
        overflowY: "auto",
        padding: "32px 40px",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          background: `linear-gradient(180deg, ${PROF.surface}, ${PROF.surfaceSoft})`,
          border: `1.5px solid ${PROF.line}`,
          borderRadius: 24,
          boxShadow: "0 30px 80px -20px rgba(46,38,64,0.4)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div style={{ padding: "24px 30px 18px", position: "relative" }}>
          <svg style={{ position: "absolute", top: -30, right: 100, opacity: 0.3 }} width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill={PROF.accent2} />
          </svg>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, position: "relative" }}>
            <div>
              <SectionLabel>Analysis report</SectionLabel>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  letterSpacing: -0.7,
                  color: PROF.ink,
                  marginTop: 6,
                  fontFamily: 'var(--font-kaisei-tokumin), serif',
                }}
              >
                {resume.fileName}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: PROF.inkSoft,
                  marginTop: 4,
                  fontFamily: 'var(--font-ibm-plex-mono), monospace',
                }}
              >
                Uploaded {formattedDate}
              </div>
              {resume.aiUsage ? (
                <div
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    marginTop: 9,
                    padding: "5px 9px",
                    borderRadius: 999,
                    background: PROF.actionBg,
                    border: `1px solid ${PROF.actionEdge}`,
                    color: PROF.actionInk,
                    fontSize: 10.5,
                    fontWeight: 700,
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                  title={`${resume.aiUsage.inputTokens.toLocaleString()} input + ${resume.aiUsage.outputTokens.toLocaleString()} output tokens across ${resume.aiUsage.calls} AI call${resume.aiUsage.calls === 1 ? "" : "s"}`}
                >
                  <span>{resume.aiUsage.totalTokens.toLocaleString()} tokens</span>
                  <span>·</span>
                  <span>{formatAIUsageCost(resume.aiUsage.estimatedCostUsd)} estimated</span>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <SectionActionButton
                label={isReextracting ? "Queueing..." : "Re-extract resume"}
                onClick={() => void reextractResume()}
                disabled={isReextracting}
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close analysis report"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: PROF.surface,
                  border: `1.5px solid ${PROF.line}`,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  color: PROF.inkSoft,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6 L 18 18 M 18 6 L 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
              gap: 10,
            }}
          >
            {statChips.map((metric) => {
              const tone =
                metric.tone === "deep"
                  ? null
                  : metric.tone === "running"
                    ? { bg: PROF.actionBg, edge: PROF.actionEdge, ink: PROF.actionInk }
                    : metric.tone === "pending"
                      ? { bg: PROF.pendingBg, edge: PROF.pendingEdge, ink: PROF.pendingInk }
                      : { bg: PROF.dangerBg, edge: PROF.dangerEdge, ink: PROF.dangerInk };

              return (
                <div
                  key={metric.label}
                  style={{
                    padding: "14px 16px",
                    background:
                      metric.tone === "deep"
                        ? `linear-gradient(135deg, ${PROF.deep}, ${PROF.deepSoft})`
                        : tone?.bg,
                    border: metric.tone === "deep" ? "none" : `1.5px solid ${tone?.edge}`,
                    borderRadius: 14,
                    color: metric.tone === "deep" ? "#fff" : tone?.ink,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      fontFamily: 'var(--font-ibm-plex-mono), monospace',
                      opacity: metric.tone === "deep" ? 0.7 : 0.85,
                    }}
                  >
                    {metric.label}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6, fontFamily: 'var(--font-kaisei-tokumin), serif', lineHeight: 1 }}>
                    {metric.value}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, opacity: metric.tone === "deep" ? 0.85 : 1 }}>
                    {metric.copy}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            padding: "0 30px 28px",
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SoftCard>
              <SectionLabel>Extracted profile</SectionLabel>
              {visiblePersonalInfoEntries.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                  {visiblePersonalInfoEntries.map((entry) => {
                    const loc = entry.key === "location" ? getLocationDisplayData(entry.value) : null;
                    return (
                      <div key={entry.key}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: PROF.inkMute,
                            letterSpacing: 1.2,
                            textTransform: "uppercase",
                            fontFamily: 'var(--font-ibm-plex-mono), monospace',
                          }}
                        >
                          {entry.label}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: PROF.ink, marginTop: 2, lineHeight: 1.5 }}>
                          {loc?.countryCode ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <ReactCountryFlag
                                aria-label={loc.displayLocation}
                                countryCode={loc.countryCode}
                                svg
                                style={{ width: "1.1rem", height: "1.1rem", flexShrink: 0 }}
                              />
                              <span>{loc.displayLocation}</span>
                            </span>
                          ) : (
                            <span>{entry.key === "location" ? loc?.displayLocation : entry.value}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <StatusBanner tone="error">No profile fields were extracted.</StatusBanner>
                </div>
              )}

              {profileLinks.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {profileLinks.map((link) => (
                    <a
                      key={`${link.type}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 10px",
                        borderRadius: 999,
                        background: PROF.surface,
                        border: `1px solid ${PROF.line}`,
                        color: PROF.inkSoft,
                        fontSize: 11.5,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: PROF.accent }} />
                      {link.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </SoftCard>

            <SoftCard>
              <SectionLabel>Summary</SectionLabel>
              {resume.parsedData.summary ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: "12px 14px",
                    background: PROF.surface,
                    border: `1.5px solid ${PROF.line}`,
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontSize: 12.5, color: PROF.ink, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                    {resume.parsedData.summary}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <StatusBanner tone="error">No summary extracted.</StatusBanner>
                </div>
              )}
            </SoftCard>

            {shouldShowImprovementTips ? (
              <SoftCard style={{ background: `linear-gradient(180deg, ${PROF.pendingBg}, ${PROF.surfaceSoft})` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <SectionLabel color={PROF.pendingInk}>Improve next</SectionLabel>
                  <span style={{ fontSize: 11, fontWeight: 700, color: PROF.pendingInk, fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>
                    ATS under 90
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  {improvementTips.map((tip, index) => (
                    <div
                      key={`${tip}-${index}`}
                      style={{
                        padding: "10px 12px",
                        background: PROF.surface,
                        border: `1.5px solid ${PROF.pendingEdge}`,
                        borderRadius: 12,
                        fontSize: 12.5,
                        color: PROF.ink,
                        lineHeight: 1.5,
                        display: "flex",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: PROF.pendingBg,
                          border: `1px solid ${PROF.pendingEdge}`,
                          color: PROF.pendingInk,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 10,
                          fontWeight: 800,
                          flexShrink: 0,
                          fontFamily: 'var(--font-ibm-plex-mono), monospace',
                        }}
                      >
                        {index + 1}
                      </span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </SoftCard>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SoftCard>
              <SectionLabel>Skills detected</SectionLabel>
              {groupedSkills.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  {groupedSkills.map((group, index) => {
                    const palette = GROUP_PALETTE[index % GROUP_PALETTE.length];
                    const isLastOddCard =
                      groupedSkills.length % 2 === 1 &&
                      index === groupedSkills.length - 1;
                    return (
                      <div
                        key={group.label}
                        style={{
                          gridColumn: isLastOddCard ? "1 / -1" : undefined,
                          padding: "10px 12px",
                          background: palette.cardBg,
                          border: `1.5px solid ${palette.cardBorder}`,
                          borderRadius: 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9.5,
                            fontWeight: 800,
                            letterSpacing: 1.2,
                            textTransform: "uppercase",
                            color: palette.label,
                            fontFamily: 'var(--font-ibm-plex-mono), monospace',
                          }}
                        >
                          {group.label}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                          {group.skills.map((skill, skillIndex) => (
                            <span
                              key={`${group.label}-${skill}-${skillIndex}`}
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                color: palette.tagText,
                                background: palette.tagBg,
                                border: `1px solid ${palette.tagBorder}`,
                                padding: "3px 8px",
                                borderRadius: 999,
                              }}
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <StatusBanner tone="error">No skills extracted yet.</StatusBanner>
                </div>
              )}
            </SoftCard>

            <SoftCard>
              <SectionLabel>Experience</SectionLabel>
              {resume.parsedData.experience.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  {resume.parsedData.experience.map((entry, index) => {
                    const isOpen = activeIdx === index;
                    const metaChips = getExperienceMetaChips(entry);

                    return (
                      <div
                        key={`${entry.title}-${entry.company}-${index}`}
                        style={{
                          background: PROF.surfaceSoft,
                          border: `1px solid ${PROF.line}`,
                          borderRadius: 12,
                          overflow: "hidden",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenResumeId(resume.id);
                            setOpenIdx(isOpen ? null : index);
                          }}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            textAlign: "left",
                            fontFamily: "inherit",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: PROF.ink }}>
                                {entry.title || "Untitled role"}
                              </span>
                              {entry.company ? (
                                <span style={{ fontSize: 11, color: PROF.inkSoft, fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>
                                  · {entry.company}
                                </span>
                              ) : null}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                              {metaChips.map((chip) => (
                                <span
                                  key={`${chip.label}-${chip.value}`}
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color:
                                      chip.tone === "company"
                                        ? PROF.pendingInk
                                        : chip.tone === "location"
                                          ? PROF.actionInk
                                          : chip.tone === "mode"
                                            ? "#924620"
                                            : PROF.inkSoft,
                                    background:
                                      chip.tone === "company"
                                        ? PROF.pendingBg
                                        : chip.tone === "location"
                                          ? PROF.actionBg
                                          : chip.tone === "mode"
                                            ? "#FFF0E6"
                                            : PROF.surface,
                                    border: `1px solid ${
                                      chip.tone === "company"
                                        ? PROF.pendingEdge
                                        : chip.tone === "location"
                                          ? PROF.actionEdge
                                          : chip.tone === "mode"
                                            ? "#FFD2BE"
                                            : PROF.line
                                    }`,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                                  }}
                                >
                                  {chip.value}
                                </span>
                              ))}
                            </div>
                          </div>
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{
                              flexShrink: 0,
                              transform: isOpen ? "rotate(180deg)" : "none",
                              transition: "transform 0.2s",
                            }}
                            aria-hidden="true"
                          >
                            <path d="M6 9 L 12 15 L 18 9" stroke={PROF.inkSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <div
                          style={{
                            maxHeight: isOpen ? 960 : 0,
                            opacity: isOpen ? 1 : 0,
                            overflow: "hidden",
                            transition: "max-height 0.32s cubic-bezier(.4,1.4,.5,1), opacity 0.22s ease",
                          }}
                        >
                          <div
                            style={{
                              padding: isOpen ? "2px 14px 14px 14px" : "0 14px",
                              transition: "padding 0.32s cubic-bezier(.4,1.4,.5,1)",
                            }}
                          >
                            {entry.description.length ? (
                              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                                {entry.description.map((detail, bulletIndex) => (
                                  <li
                                    key={`${detail}-${bulletIndex}`}
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      padding: "8px 10px",
                                      background: PROF.surface,
                                      border: `1px solid ${PROF.line}`,
                                      borderRadius: 10,
                                      fontSize: 12,
                                      color: PROF.ink,
                                      lineHeight: 1.55,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 14,
                                        height: 14,
                                        borderRadius: 999,
                                        background: PROF.completedBg,
                                        border: `1px solid ${PROF.completedEdge}`,
                                        color: PROF.completedInk,
                                        display: "grid",
                                        placeItems: "center",
                                        fontSize: 8,
                                        fontWeight: 800,
                                        flexShrink: 0,
                                        fontFamily: 'var(--font-ibm-plex-mono), monospace',
                                        marginTop: 2,
                                      }}
                                    >
                                      ★
                                    </span>
                                    <span>{detail}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <StatusBanner tone="error">No bullets extracted for this role.</StatusBanner>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <StatusBanner tone="error">No experience entries were extracted from this resume.</StatusBanner>
                </div>
              )}
            </SoftCard>

            <SoftCard>
              <SectionLabel>Education</SectionLabel>
              {visibleEducation.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                  {visibleEducation.map((entry, index) => (
                    <div
                      key={`${entry.degree}-${entry.institution}-${index}`}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "12px 14px",
                        background: `linear-gradient(135deg, ${PROF.surfaceSoft}, ${PROF.surface})`,
                        border: `1.5px solid ${PROF.line}`,
                        borderRadius: 14,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          background: "linear-gradient(135deg, #FFE58A, #F4B83C)",
                          border: "1.5px solid #E8B024",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 18,
                          flexShrink: 0,
                        }}
                      >
                        🎓
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: PROF.ink, letterSpacing: -0.1 }}>
                          {entry.degree || "Degree not detected"}
                        </div>
                        <div style={{ fontSize: 12, color: PROF.inkSoft, marginTop: 2 }}>
                          {entry.institution || "Institution not detected"}
                        </div>
                        {entry.year ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: PROF.pendingInk,
                                background: PROF.pendingBg,
                                border: `1px solid ${PROF.pendingEdge}`,
                                padding: "2px 8px",
                                borderRadius: 999,
                                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                              }}
                            >
                              {entry.year}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <StatusBanner tone="error">No education entries extracted.</StatusBanner>
                </div>
              )}
            </SoftCard>
          </div>
        </div>
      </div>
    </div>
  );
}
