"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  RESUME_TEMPLATE_CATALOGUE,
  type ResumeTemplateId,
  type TemplateData,
  type TemplateEducation,
  type TemplateExperience,
  type TemplateSkillGroup,
} from "./resume-template-types";

// ── Layout constants ──────────────────────────────────────────────────────────

const PAGE: CSSProperties = {
  background: "#fff",
  width: 816,
  minHeight: 1056,
  overflow: "visible",
  position: "relative",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.06)",
  boxSizing: "border-box",
};

const PAGE_FLOW: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
  alignItems: "center",
  width: 816,
};

// Prevents an entry block from being torn across a printed page boundary
const NO_BREAK: CSSProperties = {
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function years(period: string) {
  const m = period.match(/\d{4}/g);
  if (!m?.length) return period;
  return m.length > 1 ? `${m[0]}—${m[m.length - 1]}` : m[0];
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function Page({ children, style }: { children: ReactNode; style: CSSProperties }) {
  return <div className="rt-page" style={{ ...PAGE, ...style }}>{children}</div>;
}

function PageFlow({ children, gap = 20 }: { children: ReactNode; gap?: number }) {
  return <div className="rt-template-flow" style={{ ...PAGE_FLOW, gap }}>{children}</div>;
}

// ── Reusable content blocks ───────────────────────────────────────────────────

function RoleList({
  items,
  style,
  titleStyle,
  metaStyle,
  bulletStyle,
}: {
  items: TemplateExperience[];
  style?: CSSProperties;
  titleStyle?: CSSProperties;
  metaStyle?: CSSProperties;
  bulletStyle?: CSSProperties;
}) {
  return (
    <>
      {items.map((entry) => (
        <div
          className="rt-role-block"
          key={`${entry.role}-${entry.company}`}
          style={{ ...NO_BREAK, ...style }}
        >
          <div className="rt-role-title" style={titleStyle}>{entry.role}</div>
          <div className="rt-role-meta" style={metaStyle}>
            {[entry.company, entry.period].filter(Boolean).join(" · ")}
          </div>
          <ul style={{ margin: "5px 0 0", paddingLeft: 15 }}>
            {entry.bullets.map((bullet, i) => (
              <li key={i} style={bulletStyle}>{bullet}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function SkillRows({
  skills,
  rowStyle,
  labelStyle,
  itemStyle,
}: {
  skills: TemplateSkillGroup[];
  rowStyle?: CSSProperties;
  labelStyle?: CSSProperties;
  itemStyle?: CSSProperties;
}) {
  return (
    <>
      {skills.map((skill) => (
        <div className="rt-skill-group" key={skill.group} style={rowStyle}>
          <div className="rt-skill-label" style={labelStyle}>{skill.group}</div>
          <div className="rt-skill-items" style={itemStyle}>{skill.items}</div>
        </div>
      ))}
    </>
  );
}

function EducationList({
  education,
  style,
  titleStyle,
  metaStyle,
}: {
  education: TemplateEducation[];
  style?: CSSProperties;
  titleStyle?: CSSProperties;
  metaStyle?: CSSProperties;
}) {
  return (
    <>
      {education.map((entry) => (
        <div
          className="rt-education-block"
          key={`${entry.degree}-${entry.school}`}
          style={{ ...NO_BREAK, marginBottom: 9, ...style }}
        >
          <div style={titleStyle}>{entry.degree}</div>
          <div style={metaStyle}>{[entry.school, entry.period].filter(Boolean).join(" · ")}</div>
        </div>
      ))}
    </>
  );
}

// ── Template 01 — Editorial Serif ─────────────────────────────────────────────
// Classic two-column serif with restrained academic rhythm.
// Section order: Summary → Experience → Skills → Education (all on one flow).

function Template01({ data }: { data: TemplateData }) {
  const page: CSSProperties = {
    padding: "44px 52px",
    fontFamily: "Georgia, 'Times New Roman', serif",
    color: "#1a1814",
    fontSize: 10.5,
    lineHeight: 1.55,
  };
  const h: CSSProperties = {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 9,
    letterSpacing: "0.32em",
    textTransform: "uppercase",
    margin: "20px 0 9px",
    paddingBottom: 5,
    borderBottom: "1px solid #cdc3b3",
    color: "#1a1814",
  };
  const meta: CSSProperties = { fontSize: 10, fontStyle: "italic", color: "#7a6a55", margin: "1px 0 0" };

  return (
    <PageFlow>
      <Page style={page}>
        {/* Identity */}
        <h1 className="rt-name" style={{ fontSize: 36, lineHeight: 1.05, margin: 0, fontWeight: 600 }}>
          {data.name}
        </h1>
        <div
          className="rt-title"
          style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "#7a6a55", marginTop: 8 }}
        >
          {data.title}
        </div>
        <div style={{ borderTop: "1px solid #1a1814", margin: "14px 0 10px" }} />
        <div style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 10, color: "#4a3f32" }}>
          {[data.email, data.phone, data.location].filter(Boolean).join(" · ")}
        </div>

        {/* Summary */}
        {data.summary && (
          <>
            <div style={h}>Summary</div>
            <p className="rt-summary" style={{ margin: 0, textAlign: "justify" }}>{data.summary}</p>
          </>
        )}

        {/* Experience — primary section, comes first */}
        {data.experience.length > 0 && (
          <>
            <div style={h}>Experience</div>
            <RoleList
              items={data.experience}
              style={{ marginBottom: 13 }}
              titleStyle={{ fontSize: 13, fontWeight: 700, marginTop: 0 }}
              metaStyle={meta}
              bulletStyle={{ marginBottom: 4 }}
            />
          </>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <>
            <div style={h}>Skills</div>
            <SkillRows
              skills={data.skills}
              rowStyle={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 12, marginBottom: 5 }}
              labelStyle={{ fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700 }}
            />
          </>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <>
            <div style={h}>Education</div>
            <EducationList
              education={data.education}
              titleStyle={{ fontSize: 13, fontWeight: 700 }}
              metaStyle={meta}
            />
          </>
        )}
      </Page>
    </PageFlow>
  );
}

// ── Template 02 — Sidebar Accent ──────────────────────────────────────────────
// Dark sidebar holds identity + contact + skills.
// Main column: summary + all experience + education, fully flowing.

function Template02({ data }: { data: TemplateData }) {
  const INK = "#1c2530", ACCENT = "#c9a86a", PAPER = "#f6f3ed";

  const side: CSSProperties = {
    width: 232,
    minWidth: 232,
    background: INK,
    color: "#e9e6df",
    padding: "36px 22px",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 9.5,
    lineHeight: 1.6,
  };
  const main: CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: "36px 30px",
    background: PAPER,
    color: INK,
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 10,
    lineHeight: 1.55,
  };
  const sideH: CSSProperties = {
    fontSize: 8.5,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    fontWeight: 800,
    margin: "22px 0 8px",
    color: ACCENT,
  };
  const mainH: CSSProperties = {
    fontSize: 9,
    letterSpacing: "0.28em",
    textTransform: "uppercase",
    fontWeight: 800,
    margin: "0 0 10px",
    paddingBottom: 5,
    borderBottom: `1px solid #d6cebf`,
    color: INK,
  };

  return (
    <PageFlow>
      <Page style={{ display: "flex", alignItems: "stretch", padding: 0 }}>

        {/* ── Left sidebar ── */}
        <div style={side}>
          <h1 className="rt-name" style={{ fontFamily: "Georgia, serif", fontSize: 23, lineHeight: 1.15, color: "#fff", margin: 0 }}>
            {data.name}
          </h1>
          <div
            className="rt-title"
            style={{ color: ACCENT, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 8 }}
          >
            {data.title}
          </div>

          <div style={sideH}>Contact</div>
          <div style={{ lineHeight: 1.9, opacity: 0.9 }}>
            {data.email && <div>{data.email}</div>}
            {data.phone && <div>{data.phone}</div>}
            {data.location && <div>{data.location}</div>}
          </div>

          {data.skills.length > 0 && (
            <>
              <div style={sideH}>Skills</div>
              <SkillRows
                skills={data.skills}
                rowStyle={{ marginBottom: 10 }}
                labelStyle={{ color: ACCENT, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}
                itemStyle={{ opacity: 0.88, fontSize: 9 }}
              />
            </>
          )}
        </div>

        {/* ── Main content ── */}
        <div style={main}>
          {data.summary && (
            <div style={{ marginBottom: 18 }}>
              <div style={mainH}>Summary</div>
              <p className="rt-summary" style={{ margin: 0 }}>{data.summary}</p>
            </div>
          )}

          {data.experience.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={mainH}>Experience</div>
              <RoleList
                items={data.experience}
                style={{ marginBottom: 13 }}
                titleStyle={{ fontSize: 12.5, fontWeight: 700 }}
                metaStyle={{ fontSize: 9.5, color: "#5b6573", marginTop: 2 }}
                bulletStyle={{ marginBottom: 3.5 }}
              />
            </div>
          )}

          {data.education.length > 0 && (
            <div>
              <div style={mainH}>Education</div>
              <EducationList
                education={data.education}
                titleStyle={{ fontWeight: 700 }}
                metaStyle={{ color: "#5b6573", marginTop: 2 }}
              />
            </div>
          )}
        </div>
      </Page>
    </PageFlow>
  );
}

// ── Template 03 — Mono Minimal ────────────────────────────────────────────────
// Developer/terminal aesthetic with green accent and ## section markers.
// Section order: Summary → Experience → Skills → Education.

function Template03({ data }: { data: TemplateData }) {
  const page: CSSProperties = {
    padding: "38px 46px",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    color: "#111",
    fontSize: 9.5,
    lineHeight: 1.55,
  };
  const GREEN = "#1b6b3a";
  const SH = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 700, margin: "22px 0 10px", display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ color: GREEN }}>##</span>
      <span>{text}</span>
      <span style={{ flex: 1, borderTop: "1px solid #e0e0e0", display: "block" }} />
    </div>
  );

  return (
    <PageFlow>
      <Page style={page}>
        <div style={{ color: "#6b6b6b", marginBottom: 6, fontSize: 9 }}>{"// resume.md"}</div>
        <h1 className="rt-name" style={{ fontSize: 22, margin: 0 }}>{data.name}</h1>
        <div className="rt-title" style={{ color: GREEN, marginTop: 6 }}>{data.title}</div>
        <div style={{ borderTop: "1px dashed #ccc", margin: "18px 0 12px" }} />

        {/* Contact metadata rows */}
        {[["email", data.email], ["phone", data.phone], ["location", data.location]]
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label as string} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 16, marginBottom: 5 }}>
              <span style={{ color: "#6b6b6b" }}>{label}</span>
              <span>{value}</span>
            </div>
          ))}

        {data.summary && <>{SH("summary")}<p className="rt-summary" style={{ margin: 0 }}>{data.summary}</p></>}

        {data.experience.length > 0 && (
          <>
            {SH("experience")}
            <RoleList
              items={data.experience}
              style={{ marginBottom: 12 }}
              titleStyle={{ fontWeight: 700, fontSize: 11.5 }}
              metaStyle={{ color: "#6b6b6b", fontSize: 9, marginTop: 2 }}
              bulletStyle={{ marginBottom: 3.5 }}
            />
          </>
        )}

        {data.skills.length > 0 && (
          <>
            {SH("skills")}
            <SkillRows
              skills={data.skills}
              rowStyle={{ marginBottom: 6 }}
              labelStyle={{ color: GREEN }}
            />
          </>
        )}

        {data.education.length > 0 && (
          <>
            {SH("education")}
            <EducationList
              education={data.education}
              titleStyle={{ fontWeight: 700 }}
              metaStyle={{ color: "#6b6b6b" }}
            />
          </>
        )}
      </Page>
    </PageFlow>
  );
}

// ── Template 04 — Soft Cream ──────────────────────────────────────────────────
// Warm cream layout. Header card holds name + title + summary.
// Body flows: Contact → Experience → Skills → Education.

function Template04({ data }: { data: TemplateData }) {
  const BG = "#fbf4e8", CARD = "#fffaf2", BORDER = "#ead8bd", ACCENT = "#a46a43", MUTED = "#75695e";
  const page: CSSProperties = { background: BG, padding: "36px 42px", fontFamily: "'DM Sans', Inter, sans-serif", color: "#2d2a26", fontSize: 10, lineHeight: 1.55 };
  const h: CSSProperties = { fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: ACCENT, fontWeight: 800, margin: "18px 0 9px" };
  const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", marginBottom: 7 };

  return (
    <PageFlow>
      <Page style={page}>
        {/* Header card: name + title + summary */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, padding: "24px 28px", borderRadius: 16, marginBottom: 4 }}>
          <h1 className="rt-name" style={{ fontFamily: "Georgia, serif", fontSize: 32, margin: 0 }}>{data.name}</h1>
          <div className="rt-title" style={{ color: ACCENT, marginTop: 6 }}>{data.title}</div>
          {data.summary && <p className="rt-summary" style={{ margin: "14px 0 0", color: "#4a3f32" }}>{data.summary}</p>}
        </div>

        {/* Contact */}
        {[data.email, data.phone, data.location].filter(Boolean).length > 0 && (
          <div style={{ ...card, marginTop: 6 }}>
            {[data.email, data.phone, data.location].filter(Boolean).join("  ·  ")}
          </div>
        )}

        {/* Experience */}
        {data.experience.length > 0 && (
          <>
            <div style={h}>Experience</div>
            <RoleList
              items={data.experience}
              style={{ ...card }}
              titleStyle={{ fontWeight: 800, fontSize: 12 }}
              metaStyle={{ color: MUTED, fontSize: 9.5, marginTop: 2 }}
              bulletStyle={{ marginBottom: 3.5 }}
            />
          </>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <>
            <div style={h}>Skills</div>
            <SkillRows
              skills={data.skills}
              rowStyle={{ ...card }}
              labelStyle={{ color: ACCENT, fontWeight: 800 }}
              itemStyle={{ color: MUTED }}
            />
          </>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <>
            <div style={h}>Education</div>
            <EducationList
              education={data.education}
              style={card}
              titleStyle={{ fontWeight: 800 }}
              metaStyle={{ color: MUTED, marginTop: 2 }}
            />
          </>
        )}
      </Page>
    </PageFlow>
  );
}

// ── Template 05 — Swiss Grid ──────────────────────────────────────────────────
// Numbered section rail on the left, content on the right.
// Section order: §01 Profile → §02 Experience → §03 Skills → §04 Education.

function Template05({ data }: { data: TemplateData }) {
  const page: CSSProperties = { padding: "36px 44px", fontFamily: "Inter, Arial, sans-serif", color: "#101820", fontSize: 9.5, lineHeight: 1.5 };
  const BLUE = "#2457ff";
  const sec: CSSProperties = { display: "grid", gridTemplateColumns: "64px 1fr", gap: 18, marginTop: 22, breakInside: "avoid", pageBreakInside: "avoid" };
  const num: CSSProperties = { color: BLUE, fontSize: 9, letterSpacing: "0.18em", fontWeight: 800, paddingTop: 3 };
  const secH: CSSProperties = { fontSize: 14, fontWeight: 800, marginBottom: 9 };

  let counter = 0;
  const Sec = (label: string, children: ReactNode) => {
    counter += 1;
    const n = String(counter).padStart(2, "0");
    return (
      <div style={sec}>
        <div style={num}>§ {n}</div>
        <div>
          <div style={secH}>{label}</div>
          {children}
        </div>
      </div>
    );
  };

  return (
    <PageFlow>
      <Page style={page}>
        {/* Header */}
        <h1 className="rt-name" style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>{data.name}</h1>
        <div className="rt-title" style={{ color: BLUE, letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 6 }}>{data.title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 20, borderTop: "2px solid #101820", paddingTop: 10 }}>
          {[data.email, data.phone, data.location].filter(Boolean).map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>

        {data.summary && Sec("Profile", <p className="rt-summary" style={{ margin: 0 }}>{data.summary}</p>)}

        {data.experience.length > 0 && Sec(
          "Experience",
          <RoleList
            items={data.experience}
            style={{ marginBottom: 12 }}
            titleStyle={{ fontWeight: 800, fontSize: 12 }}
            metaStyle={{ color: "#606872", fontSize: 9, marginTop: 1 }}
            bulletStyle={{ marginBottom: 3.5 }}
          />,
        )}

        {data.skills.length > 0 && Sec(
          "Skills",
          <SkillRows
            skills={data.skills}
            rowStyle={{ display: "grid", gridTemplateColumns: "128px 1fr", gap: 12, marginBottom: 6 }}
            labelStyle={{ fontWeight: 800 }}
          />,
        )}

        {data.education.length > 0 && Sec(
          "Education",
          <EducationList
            education={data.education}
            titleStyle={{ fontWeight: 800 }}
            metaStyle={{ color: "#606872" }}
          />,
        )}
      </Page>
    </PageFlow>
  );
}

// ── Template 06 — Bold Display ────────────────────────────────────────────────
// Oversized name, high-contrast typography, orange accent.
// Section order: Profile → Experience → Stack → Education.

function Template06({ data }: { data: TemplateData }) {
  const BG = "#f4f1ec", INK = "#0d0d0d", ORANGE = "#ff5722";
  const page: CSSProperties = { background: BG, padding: "32px 40px", fontFamily: "'Space Grotesk', Inter, sans-serif", color: INK, fontSize: 9.5, lineHeight: 1.5 };
  const h: CSSProperties = { fontSize: 20, fontWeight: 900, margin: "20px 0 9px" };

  return (
    <PageFlow>
      <Page style={page}>
        {/* Giant name */}
        <div style={{ borderBottom: "3px solid #0d0d0d", paddingBottom: 16 }}>
          <h1 className="rt-name" style={{ fontSize: 52, fontWeight: 900, lineHeight: 0.95, margin: 0, textTransform: "uppercase", letterSpacing: "-0.04em" }}>
            {data.name}
          </h1>
        </div>
        <div className="rt-title" style={{ background: INK, color: BG, display: "inline-block", padding: "3px 10px", marginTop: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {data.title}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 12, fontSize: 9 }}>
          {[data.email, data.phone, data.location].filter(Boolean).map((item) => (
            <span key={item} style={{ color: ORANGE }}>{item}</span>
          ))}
        </div>

        {data.summary && (
          <>
            <div style={h}>Profile<span style={{ color: ORANGE }}>.</span></div>
            <p className="rt-summary" style={{ margin: 0 }}>{data.summary}</p>
          </>
        )}

        {data.experience.length > 0 && (
          <>
            <div style={h}>Experience<span style={{ color: ORANGE }}>.</span></div>
            <RoleList
              items={data.experience}
              style={{ borderTop: "1px solid #d6cfc2", paddingTop: 10, marginBottom: 12 }}
              titleStyle={{ fontWeight: 900, fontSize: 12.5 }}
              metaStyle={{ color: "#7a7466", fontSize: 9, marginTop: 1 }}
              bulletStyle={{ marginBottom: 3.5 }}
            />
          </>
        )}

        {data.skills.length > 0 && (
          <>
            <div style={h}>Stack<span style={{ color: ORANGE }}>.</span></div>
            <SkillRows
              skills={data.skills}
              rowStyle={{ borderBottom: "1px solid #d6cfc2", paddingBottom: 6, marginBottom: 6 }}
              labelStyle={{ fontWeight: 900 }}
            />
          </>
        )}

        {data.education.length > 0 && (
          <>
            <div style={h}>Education<span style={{ color: ORANGE }}>.</span></div>
            <EducationList
              education={data.education}
              titleStyle={{ fontWeight: 900 }}
              metaStyle={{ color: "#7a7466" }}
            />
          </>
        )}
      </Page>
    </PageFlow>
  );
}

// ── Template 07 — Timeline ────────────────────────────────────────────────────
// Year rail on left of each experience entry; italic serif headers.
// Section order: Summary → Experience (timeline) → Skills → Education.

function Template07({ data }: { data: TemplateData }) {
  const TEAL = "#3a7d6e";
  const page: CSSProperties = { padding: "36px 44px", fontFamily: "Inter, sans-serif", color: "#1c1f24", fontSize: 10, lineHeight: 1.5 };
  const h: CSSProperties = { fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 20, margin: "20px 0 11px", color: "#1c1f24" };

  return (
    <PageFlow>
      <Page style={page}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #1c1f24", paddingBottom: 14 }}>
          <div>
            <h1 className="rt-name" style={{ fontFamily: "Georgia, serif", fontSize: 34, margin: 0 }}>{data.name}</h1>
            <div className="rt-title" style={{ color: TEAL, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 5 }}>{data.title}</div>
          </div>
          <div style={{ color: "#737881", textAlign: "right", fontSize: 9.5, lineHeight: 1.9 }}>
            {data.email && <div>{data.email}</div>}
            {data.phone && <div>{data.phone}</div>}
            {data.location && <div>{data.location}</div>}
          </div>
        </div>

        {data.summary && (
          <>
            <div style={h}>Summary</div>
            <p className="rt-summary" style={{ margin: 0 }}>{data.summary}</p>
          </>
        )}

        {data.experience.length > 0 && (
          <>
            <div style={h}>Experience</div>
            {data.experience.map((entry) => (
              <div
                key={entry.role}
                style={{ ...NO_BREAK, position: "relative", paddingLeft: 90, marginBottom: 14 }}
              >
                <div style={{ position: "absolute", left: 0, top: 2, width: 68, color: TEAL, fontWeight: 800, textAlign: "right", fontSize: 9.5 }}>
                  {years(entry.period)}
                </div>
                <div style={{ position: "absolute", left: 80, top: 5, width: 9, height: 9, borderRadius: "50%", border: `2px solid ${TEAL}`, background: "#fff" }} />
                <div className="rt-role-title" style={{ fontWeight: 800, fontSize: 12 }}>{entry.role}</div>
                <div className="rt-role-meta" style={{ color: "#737881", fontSize: 9.5, marginTop: 1 }}>{entry.company}</div>
                <ul style={{ margin: "5px 0 0", paddingLeft: 14 }}>
                  {entry.bullets.map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{b}</li>)}
                </ul>
              </div>
            ))}
          </>
        )}

        {data.skills.length > 0 && (
          <>
            <div style={h}>Skills</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 26px" }}>
              <SkillRows
                skills={data.skills}
                labelStyle={{ color: TEAL, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800 }}
                itemStyle={{ fontSize: 9.5 }}
              />
            </div>
          </>
        )}

        {data.education.length > 0 && (
          <>
            <div style={h}>Education</div>
            <EducationList
              education={data.education}
              titleStyle={{ fontWeight: 800 }}
              metaStyle={{ color: "#737881" }}
            />
          </>
        )}
      </Page>
    </PageFlow>
  );
}

// ── Template 08 — Card Modular ────────────────────────────────────────────────
// White cards on soft gray. Each section is its own card.
// Section order: Header → Summary → Experience → Skills → Education.

function Template08({ data }: { data: TemplateData }) {
  const BG = "#eef0f3", BLUE = "#5b6cff";
  const page: CSSProperties = { background: BG, padding: 26, fontFamily: "Inter, sans-serif", color: "#1a2030", fontSize: 9.5, lineHeight: 1.5 };
  const card: CSSProperties = { background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 12 };
  const h: CSSProperties = { fontSize: 8.5, letterSpacing: "0.24em", textTransform: "uppercase", color: "#5b6573", fontWeight: 800, marginBottom: 10 };

  return (
    <PageFlow>
      <Page style={page}>
        {/* Header card */}
        <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr 188px", gap: 18, marginBottom: 12 }}>
          <div>
            <h1 className="rt-name" style={{ fontSize: 22, margin: 0 }}>{data.name}</h1>
            <div className="rt-title" style={{ color: BLUE, marginTop: 4 }}>{data.title}</div>
          </div>
          <div style={{ background: "#1a2030", color: "#fff", borderRadius: 8, padding: "10px 13px", fontSize: 9, lineHeight: 1.8 }}>
            {data.email && <div>{data.email}</div>}
            {data.phone && <div>{data.phone}</div>}
            {data.location && <div>{data.location}</div>}
          </div>
        </div>

        {data.summary && (
          <div style={card}>
            <div style={h}>Summary</div>
            <p className="rt-summary" style={{ margin: 0 }}>{data.summary}</p>
          </div>
        )}

        {data.experience.length > 0 && (
          <div style={card}>
            <div style={h}>Experience</div>
            <RoleList
              items={data.experience}
              style={{ marginBottom: 12 }}
              titleStyle={{ fontWeight: 800, fontSize: 11.5 }}
              metaStyle={{ color: "#5b6573", fontSize: 9, marginTop: 1 }}
              bulletStyle={{ marginBottom: 3 }}
            />
          </div>
        )}

        {data.skills.length > 0 && (
          <div style={card}>
            <div style={h}>Skills</div>
            <SkillRows
              skills={data.skills}
              rowStyle={{ borderBottom: "1px solid #eef0f3", paddingBottom: 6, marginBottom: 6 }}
              labelStyle={{ color: BLUE, fontWeight: 800 }}
              itemStyle={{ fontSize: 9 }}
            />
          </div>
        )}

        {data.education.length > 0 && (
          <div style={card}>
            <div style={h}>Education</div>
            <EducationList
              education={data.education}
              style={{ marginBottom: 10 }}
              titleStyle={{ fontWeight: 800 }}
              metaStyle={{ color: "#5b6573" }}
            />
          </div>
        )}
      </Page>
    </PageFlow>
  );
}

// ── Template 09 — Elegant Dark ────────────────────────────────────────────────
// Full dark background with gold accents. Single page, executive feel.
// Section order: Summary → Experience → Skills → Education.

function Template09({ data }: { data: TemplateData }) {
  const GOLD = "#d4a95f", MUTED = "#b8b0a5";
  const page: CSSProperties = {
    background: "#151515",
    color: "#f4efe6",
    padding: "44px 50px",
    fontFamily: "Inter, sans-serif",
    fontSize: 10,
    lineHeight: 1.55,
  };
  const h: CSSProperties = {
    color: GOLD,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontWeight: 800,
    fontSize: 9,
    margin: "22px 0 10px",
  };
  const rule: CSSProperties = { borderTop: "1px solid #2e2e2e", margin: "0 0 10px" };

  return (
    <PageFlow>
      <Page style={page}>
        {/* Identity */}
        <div style={{ color: GOLD, letterSpacing: "0.22em", textTransform: "uppercase", fontSize: 9 }}>Portfolio Resume</div>
        <h1 className="rt-name" style={{ fontFamily: "Georgia, serif", fontSize: 40, lineHeight: 1.05, margin: "14px 0 8px" }}>{data.name}</h1>
        <div className="rt-title" style={{ color: GOLD, fontSize: 13 }}>{data.title}</div>
        <div style={{ marginTop: 10, color: MUTED, lineHeight: 1.9, fontSize: 9.5 }}>
          {[data.email, data.phone, data.location].filter(Boolean).join("  ·  ")}
        </div>
        <div style={{ ...rule, marginTop: 18 }} />

        {data.summary && (
          <>
            <div style={h}>Summary</div>
            <p className="rt-summary" style={{ margin: 0, fontSize: 11 }}>{data.summary}</p>
          </>
        )}

        {data.experience.length > 0 && (
          <>
            <div style={{ ...h, marginTop: 22 }}>Experience</div>
            <RoleList
              items={data.experience}
              style={{ marginBottom: 14 }}
              titleStyle={{ fontWeight: 800, fontSize: 12 }}
              metaStyle={{ color: MUTED, fontSize: 9.5, marginTop: 2 }}
              bulletStyle={{ marginBottom: 3.5 }}
            />
          </>
        )}

        {data.skills.length > 0 && (
          <>
            <div style={{ ...rule, marginTop: 6 }} />
            <div style={h}>Skills</div>
            <SkillRows
              skills={data.skills}
              rowStyle={{ borderTop: "1px solid #2e2e2e", paddingTop: 8, marginBottom: 8 }}
              labelStyle={{ fontWeight: 800, color: "#f4efe6" }}
              itemStyle={{ color: MUTED }}
            />
          </>
        )}

        {data.education.length > 0 && (
          <>
            <div style={{ ...rule, marginTop: 6 }} />
            <div style={h}>Education</div>
            <EducationList
              education={data.education}
              titleStyle={{ fontWeight: 800 }}
              metaStyle={{ color: MUTED }}
            />
          </>
        )}
      </Page>
    </PageFlow>
  );
}

// ── Template 10 — Tech Blueprint ─────────────────────────────────────────────
// Blueprint/terminal aesthetic. Light blue background, monospace, framed boxes.
// Section order: [01] Summary → [02] Experience → [03] Stack → [04] Education.

function Template10({ data }: { data: TemplateData }) {
  const BLUE = "#2d6cdf";
  const page: CSSProperties = { background: "#eef5ff", color: "#0b2747", padding: "36px 44px", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: 9.5, lineHeight: 1.5 };
  const box: CSSProperties = { background: "#fff", border: "1px solid #d8dee8", padding: "9px 12px", marginBottom: 7 };
  const h = (num: string, label: string) => (
    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 800, margin: "20px 0 9px" }}>
      <span style={{ color: BLUE }}>[{num}]</span> {label}
    </div>
  );

  return (
    <PageFlow>
      <Page style={page}>
        {/* Header */}
        <div style={{ color: BLUE, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 9 }}>{"// candidate.profile"}</div>
        <h1 className="rt-name" style={{ fontFamily: "Inter, sans-serif", fontSize: 30, margin: "4px 0 0", fontWeight: 800 }}>{data.name}</h1>
        <div className="rt-title" style={{ display: "inline-block", marginTop: 8, padding: "2px 10px", background: "#fff", border: `1px solid ${BLUE}`, fontSize: 9.5 }}>
          &lt;{data.title}/&gt;
        </div>
        <div style={{ ...box, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 18 }}>
          {[data.email, data.phone, data.location].filter(Boolean).map((item) => <div key={item}>{item}</div>)}
        </div>

        {data.summary && (
          <>
            {h("01", "Summary")}
            <div style={box}><p className="rt-summary" style={{ margin: 0 }}>{data.summary}</p></div>
          </>
        )}

        {data.experience.length > 0 && (
          <>
            {h("02", "Experience")}
            <RoleList
              items={data.experience}
              style={{ ...box }}
              titleStyle={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 12 }}
              metaStyle={{ color: "#5b6f86", fontSize: 9, marginTop: 1 }}
              bulletStyle={{ marginBottom: 3.5 }}
            />
          </>
        )}

        {data.skills.length > 0 && (
          <>
            {h("03", "Stack")}
            <SkillRows
              skills={data.skills}
              rowStyle={box}
              labelStyle={{ color: BLUE, letterSpacing: "0.1em", textTransform: "uppercase" }}
            />
          </>
        )}

        {data.education.length > 0 && (
          <>
            {h("04", "Education")}
            <EducationList
              education={data.education}
              style={box}
              titleStyle={{ fontWeight: 800 }}
              metaStyle={{ color: "#5b6f86" }}
            />
          </>
        )}
      </Page>
    </PageFlow>
  );
}

// ── Public exports ────────────────────────────────────────────────────────────

export function ResumeTemplate({ id, data }: { id: ResumeTemplateId; data: TemplateData }) {
  switch (id) {
    case "t01": return <Template01 data={data} />;
    case "t02": return <Template02 data={data} />;
    case "t03": return <Template03 data={data} />;
    case "t04": return <Template04 data={data} />;
    case "t05": return <Template05 data={data} />;
    case "t06": return <Template06 data={data} />;
    case "t07": return <Template07 data={data} />;
    case "t08": return <Template08 data={data} />;
    case "t09": return <Template09 data={data} />;
    case "t10": return <Template10 data={data} />;
  }
}

export function ResumeTemplatePreviewCard({
  id,
  data,
  active,
  onSelect,
}: {
  id: ResumeTemplateId;
  data: TemplateData;
  active?: boolean;
  onSelect: (id: ResumeTemplateId) => void;
}) {
  const entry = RESUME_TEMPLATE_CATALOGUE.find((item) => item.id === id)!;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`resume-template-card${active ? " is-active" : ""}`}
    >
      <span className="resume-template-card-preview" aria-hidden="true">
        <span className="resume-template-card-scale">
          <ResumeTemplate id={id} data={data} />
        </span>
      </span>
      <span className="resume-template-card-copy">
        <strong>{entry.label}</strong>
        <small>{entry.description}</small>
      </span>
    </button>
  );
}
