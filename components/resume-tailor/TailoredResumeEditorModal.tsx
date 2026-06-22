"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ResumeColorThemeControls } from "@/components/resume-tailor/ResumeColorThemeControls";
import {
  RESUME_TEMPLATE_CATALOGUE,
  RESUME_TEMPLATE_PICKER_STYLES,
  ResumeTemplatePickerModal,
  renderResumeTemplateToHtml,
  toTemplateData,
  wrapResumeTemplateHtmlDocument,
  type ResumeTemplateId,
} from "@/components/resume-templates";
import type { SafeBackgroundTask } from "@/lib/background-task";
import type { SafeGeneration } from "@/lib/generation";
import { readApiResponse } from "@/lib/client-api";
import { downloadFileResponse } from "@/lib/client-download";
import { buildClientEditorHtmlFromResume } from "@/lib/client-editor-html";
import {
  buildAutoPaginatedEditorHtml,
  relayoutEditorPageBreaks,
} from "@/lib/client-editor-pagination";
import { loadCKEditor, type EditorHandle, type LoadedCKEditor } from "@/lib/ckeditor-client";
import { extractResumeDataFromEditorHtml } from "@/lib/editor-html-parser";
import {
  DEFAULT_RESUME_DOCUMENT_STYLE,
  RESUME_FONT_OPTIONS,
  RESUME_MARGIN_PRESETS,
  RESUME_PAGE_SIZES,
  getResumeStyleCssVariables,
  normalizeResumeDocumentStyle,
  type ResumeMarginPreset,
  type ResumePageSize,
} from "@/lib/resume-document-style";
import { useToast } from "@/components/ui/toast-provider";

type SaveResponse = {
  error?: string;
  generation?: SafeGeneration;
};

export type StreamedResumeSection = {
  section: string;
  html: string;
};

type TailoredResumeEditorModalProps = {
  open: boolean;
  task: SafeBackgroundTask | null;
  generation: SafeGeneration | null;
  statusLabel: string;
  progress: number;
  editorHtml: string;
  sections: StreamedResumeSection[];
  isStreaming: boolean;
  error: string | null;
  onClose: () => void;
  onCancelGeneration: () => void;
  onEditorHtmlChange: (html: string) => void;
  onGenerationSaved: (generation: SafeGeneration) => void;
  onOpenEditPage?: (generationId: string) => void;
};

// ─── Modal chrome palette (warm ink / parchment) ──────────────────────────────
const THEME = {
  ink: "#1f1914",
  ink2: "#41342c",
  ink3: "#74675d",
  moss: "#596a40",
  paper: "#fffaf1",
  paperWarm: "#f4ead8",
  rule: "#e4cfaa",
  ruleSoft: "#eadcc7",
  danger: "#9b2f22",
};

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

// ─── Toolbar design tokens (from design file: styles.css) ──────────────────────
// Uses oklch() — supported in all modern browsers (Chrome 111+, Firefox 113+, Safari 15.4+)
const TB = {
  bgToolbar: "oklch(0.965 0.015 80)",
  bgPaper:   "oklch(0.985 0.008 80)",
  line:      "oklch(0.88  0.012 80)",
  lineSoft:  "oklch(0.92  0.010 80)",
  ink:       "oklch(0.28  0.010 80)",
  inkMute:   "oklch(0.50  0.012 80)",
  inkFaint:  "oklch(0.62  0.010 80)",
  accent:    "oklch(0.62  0.13  55)",
  accentSoft:"oklch(0.94  0.04  55)",
  accentInk: "oklch(0.42  0.14  55)",
  hover:     "oklch(0.94  0.018 80)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDownloadName(generation: SafeGeneration | null, format: "pdf" | "docx") {
  const candidate = generation?.tailoredData.personalInfo.name || "Candidate";
  const role = generation?.jobDescription?.company || generation?.jobDescription?.title || "Role";
  const safeName = `${candidate}_${role}`
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
  return `Tailored_Resume_${safeName || "Draft"}.${format}`;
}

// ─── Modal utility button (header area) ───────────────────────────────────────
function ModalButton({
  children,
  disabled,
  tone = "secondary",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
  onClick: () => void;
}) {
  const isPrimary = tone === "primary";
  const isDanger = tone === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-10 rounded-[999px] px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        border: isPrimary ? "none" : `1px solid ${isDanger ? THEME.danger : THEME.rule}`,
        background: isPrimary ? THEME.ink : "#fff",
        color: isPrimary ? "#fff" : isDanger ? THEME.danger : THEME.ink2,
      }}
    >
      {children}
    </button>
  );
}

// ─── Ruler components ─────────────────────────────────────────────────────────
function HorizontalRuler() {
  return (
    <div className="tailored-resume-ruler tailored-resume-ruler-horizontal" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} style={{ left: `${index * 12.5}%` }}>
          {index}
        </span>
      ))}
    </div>
  );
}

function VerticalRuler() {
  return (
    <div className="tailored-resume-ruler tailored-resume-ruler-vertical" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} style={{ top: `${index * 8.333}%` }}>
          {index}
        </span>
      ))}
    </div>
  );
}

// ─── Toolbar: small caret SVG ─────────────────────────────────────────────────
function TbCaret() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0, color: TB.inkFaint }}>
      <path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Toolbar: icon component ──────────────────────────────────────────────────
const SV = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function TbIcon({ name, size = 14 }: { name: string; size?: number }) {
  const s = size;
  switch (name) {
    case "minus":
      return <svg width={s} height={s} viewBox="0 0 16 16"><line x1="3.5" y1="8" x2="12.5" y2="8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>;
    case "plus":
      return <svg width={s} height={s} viewBox="0 0 16 16"><line x1="3.5" y1="8" x2="12.5" y2="8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /><line x1="8" y1="3.5" x2="8" y2="12.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>;
    case "save":
      return <svg width={s} height={s} viewBox="0 0 16 16"><path d="M3 3h8l2 2v8H3z" {...SV} /><path d="M5 3v4h6V3" {...SV} /><path d="M5 13v-4h6v4" {...SV} /></svg>;
    case "download":
      return <svg width={s} height={s} viewBox="0 0 16 16"><path d="M8 2v8" {...SV} /><path d="M5 7l3 3 3-3" {...SV} /><path d="M3 13h10" {...SV} /></svg>;
    case "layout":
      return <svg width={s} height={s} viewBox="0 0 16 16"><rect x="2.5" y="3" width="4.2" height="10" rx="0.8" {...SV} /><rect x="8.2" y="3" width="5.3" height="4" rx="0.8" {...SV} /><rect x="8.2" y="9" width="5.3" height="4" rx="0.8" {...SV} /></svg>;
    case "autoBreak":
      return <svg width={s} height={s} viewBox="0 0 16 16"><path d="M4 2.5h8" {...SV} /><path d="M4 13.5h8" {...SV} /><path d="M3 8h10" stroke="currentColor" strokeWidth={1.5} strokeDasharray="2 2" strokeLinecap="round" /><path d="M8 4.5v2.2" {...SV} /><path d="M8 9.3v2.2" {...SV} /></svg>;
    case "chevron":
      return <svg width={s} height={s} viewBox="0 0 16 16"><path d="M5 6l3 3 3-3" {...SV} /></svg>;
    case "check":
      return <svg width={s} height={s} viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6" {...SV} /></svg>;
    default:
      return null;
  }
}

// ─── Toolbar: generic dropdown menu ───────────────────────────────────────────
type TbMenuOption = { key: string; label: string; fontFamily?: string };

function TbMenu({
  value,
  options,
  onSelect,
  minWidth,
}: {
  value: string;
  options: TbMenuOption[];
  onSelect: (key: string) => void;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open || !ref.current) return;

    const updateMenuPosition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setMenuStyle({
        left: rect.left,
        minWidth: minWidth ? `${minWidth}px` : Math.max(160, rect.width),
        position: "fixed",
        top: rect.bottom + 6,
        zIndex: 1000,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, minWidth]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="tb-trigger"
        style={{ minWidth: minWidth ? `${minWidth}px` : undefined }}
      >
        <span className="tb-trigger-label">{value}</span>
        <TbCaret />
      </button>
      {open && menuStyle && createPortal(
        <div ref={menuRef} className="tb-menu" style={menuStyle}>
          {options.map((opt) => {
            const selected = opt.label === value;
            return (
              <button
                key={opt.key}
                type="button"
                className={`tb-menu-item${selected ? " is-selected" : ""}`}
                onClick={() => { onSelect(opt.key); setOpen(false); }}
              >
                <span style={opt.fontFamily ? { fontFamily: opt.fontFamily } : undefined}>{opt.label}</span>
                {selected && <TbIcon name="check" size={12} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Toolbar: zoom control ─────────────────────────────────────────────────────
function TbZoom({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
  return (
    <div className="tb-zoom">
      <button
        type="button"
        className="tb-icon-btn"
        onClick={() => setZoom(clampZoom(zoom - ZOOM_STEP))}
        aria-label="Zoom out"
        disabled={zoom <= MIN_ZOOM}
      >
        <TbIcon name="minus" size={14} />
      </button>
      <button
        type="button"
        className="tb-zoom-value"
        onClick={() => setZoom(100)}
        title="Reset zoom to 100%"
      >
        {zoom}%
      </button>
      <button
        type="button"
        className="tb-icon-btn"
        onClick={() => setZoom(clampZoom(zoom + ZOOM_STEP))}
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
      >
        <TbIcon name="plus" size={14} />
      </button>
    </div>
  );
}

// ─── Toolbar: split action button (Download + chevron) ────────────────────────
type TbActionItem = { label: string; icon?: string; hint?: string; onClick?: () => void };

function TbActionMenu({
  primaryLabel,
  primaryIcon,
  onPrimary,
  items,
  primary = false,
  disabled = false,
}: {
  primaryLabel: string;
  primaryIcon?: string;
  onPrimary: () => void;
  items: TbActionItem[];
  primary?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open || !ref.current) return;

    const updateMenuPosition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setMenuStyle({
        minWidth: 210,
        position: "fixed",
        right: window.innerWidth - rect.right,
        top: rect.bottom + 6,
        zIndex: 1000,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={`tb-split${primary ? " is-primary" : ""}`}>
      <button
        type="button"
        className="tb-split-main"
        onClick={onPrimary}
        disabled={disabled}
      >
        {primaryIcon && <TbIcon name={primaryIcon} size={13} />}
        <span>{primaryLabel}</span>
      </button>
      <button
        type="button"
        className="tb-split-caret"
        onClick={() => setOpen((o) => !o)}
        aria-label="More download options"
        disabled={disabled}
      >
        <TbIcon name="chevron" size={12} />
      </button>
      {open && menuStyle && createPortal(
        <div ref={menuRef} className="tb-menu" style={menuStyle}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="tb-menu-item"
              onClick={() => { item.onClick?.(); setOpen(false); }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {item.icon && <TbIcon name={item.icon} size={12} />}
                {item.label}
              </span>
              {item.hint && (
                <span style={{ fontSize: 11, color: TB.inkFaint, fontFamily: "ui-monospace, monospace" }}>
                  {item.hint}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function TailoredResumeEditorModal({
  open,
  task,
  generation,
  statusLabel,
  progress,
  editorHtml,
  sections,
  isStreaming,
  error,
  onClose,
  onCancelGeneration,
  onEditorHtmlChange,
  onGenerationSaved,
  onOpenEditPage,
}: TailoredResumeEditorModalProps) {
  const { showErrorToast } = useToast();
  const editorRef = useRef<EditorHandle | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const canvasPanRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [ckeditor, setCkeditor] = useState<LoadedCKEditor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "docx" | null>(null);
  const [dirtySections, setDirtySections] = useState<Set<string>>(() => new Set());
  const [documentStyle, setDocumentStyle] = useState(DEFAULT_RESUME_DOCUMENT_STYLE);
  const [zoom, setZoom] = useState(100);
  const [draftMode, setDraftMode] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<ResumeTemplateId | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const editorHtmlRef = useRef(editorHtml);
  // Stores the base-format (CKEditor) HTML so it can be restored when the user
  // deselects a template.  Set when a template is first applied; cleared when
  // returning to default so the next template application saves a fresh snapshot.
  const preTemplateHtmlRef = useRef<string | null>(null);
  const documentStyleVariables = getResumeStyleCssVariables(documentStyle) as CSSProperties;

  // Scroll the CKEditor shell to a named resume section
  const scrollToSection = useCallback((sectionKey: string) => {
    const shell = editorShellRef.current;
    if (!shell) return;

    setActiveSection(sectionKey);

    // CKEditor renders inside .ck-editor__editable; sections carry
    // data-tailor-section="<key>" set by the HTML builder.
    const editable = shell.querySelector<HTMLElement>(".ck-editor__editable");
    const target = editable?.querySelector<HTMLElement>(
      `[data-tailor-section="${sectionKey}"]`,
    );

    if (!target) return;

    const shellRect = shell.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    // Offset so the section heading lands ~56px from the top of the shell
    const nextScrollTop = shell.scrollTop + (targetRect.top - shellRect.top) - 56;

    shell.scrollTo({ top: nextScrollTop, behavior: "smooth" });
  }, []);

  // Toolbar display values
  const currentPageLabel = RESUME_PAGE_SIZES[documentStyle.pageSize].label;
  const currentMarginLabel = RESUME_MARGIN_PRESETS[documentStyle.marginPreset]?.label ?? "Margins";
  const currentFontLabel =
    RESUME_FONT_OPTIONS.find((f) => f.value === documentStyle.fontFamily)?.label ?? "Font";
  const selectedTemplateLabel =
    RESUME_TEMPLATE_CATALOGUE.find((entry) => entry.id === selectedTemplateId)
      ?.shortLabel ?? "Templates";

  // Page size options for toolbar
  const pageSizeOptions: TbMenuOption[] = (
    Object.entries(RESUME_PAGE_SIZES) as [ResumePageSize, { label: string }][]
  ).map(([key, val]) => ({ key, label: val.label }));

  // Margin options for toolbar (exclude "custom")
  const marginOptions: TbMenuOption[] = (
    Object.entries(RESUME_MARGIN_PRESETS) as [ResumeMarginPreset, { label: string }][]
  )
    .filter(([key]) => key !== "custom")
    .map(([key, val]) => ({ key, label: val.label }));

  // Font options for toolbar
  const fontOptions: TbMenuOption[] = RESUME_FONT_OPTIONS.map((f) => ({
    key: f.value,
    label: f.label,
    fontFamily: f.value,
  }));

  const getCurrentResumeData = useCallback(() => {
    return extractResumeDataFromEditorHtml(
      editorRef.current?.getData() ?? editorHtmlRef.current,
      generation?.tailoredData ?? {
        personalInfo: { name: "", title: "", email: "", phone: "", location: "", links: [] },
        summary: "",
        skills: [],
        experience: [],
        education: [],
      },
    );
  }, [generation?.tailoredData]);

  // When a template is active, extract resume data from the SAVED base HTML
  // rather than from the template HTML currently in the editor.  The template
  // picker uses this to show accurate preview data regardless of which template
  // is currently loaded into CKEditor.
  const getBaseResumeData = useCallback(() => {
    const baseHtml = preTemplateHtmlRef.current;
    if (baseHtml) {
      return extractResumeDataFromEditorHtml(baseHtml, getCurrentResumeData());
    }
    return getCurrentResumeData();
  }, [getCurrentResumeData]);

  const applyEditorTemplate = useCallback(
    async (templateId: ResumeTemplateId | null) => {
      let nextHtml: string;

      if (!templateId) {
        // ── Returning to default ──────────────────────────────────────────────
        // Restore the exact CKEditor HTML saved before any template was applied.
        // Never try to parse template HTML back into resume data — CKEditor may
        // have modified the template structure, causing garbled skill sections.
        const savedHtml = preTemplateHtmlRef.current;
        preTemplateHtmlRef.current = null;

        nextHtml = savedHtml ?? buildClientEditorHtmlFromResume(getCurrentResumeData());
      } else {
        // ── Applying (or switching) a template ────────────────────────────────
        // If we're not already in template mode, save the current base HTML so
        // it can be restored later.  If already in template mode (switching
        // between templates), the saved snapshot is still valid — don't overwrite.
        if (!preTemplateHtmlRef.current) {
          preTemplateHtmlRef.current =
            editorRef.current?.getData() ?? editorHtmlRef.current;
        }

        // Build template HTML from the SAVED base HTML (not the template HTML
        // currently in the editor) so data extraction is always reliable.
        const baseHtml = preTemplateHtmlRef.current;
        const resumeData = extractResumeDataFromEditorHtml(
          baseHtml,
          getCurrentResumeData(),
        );
        nextHtml = renderResumeTemplateToHtml(templateId, toTemplateData(resumeData));
      }

      editorRef.current?.setData?.(nextHtml);
      editorHtmlRef.current = nextHtml;
      onEditorHtmlChange(nextHtml);
      setSelectedTemplateId(templateId);
      setDirtySections(new Set(["document"]));
    },
    [getCurrentResumeData, onEditorHtmlChange],
  );

  const applyAutoPageBreaks = useCallback(() => {
    const currentHtml = editorRef.current?.getData() ?? editorHtmlRef.current;
    const nextHtml = buildAutoPaginatedEditorHtml(
      currentHtml,
      documentStyle,
      `tailored-resume-ckeditor ${selectedTemplateId ? "is-custom-template" : "is-base-template"}`,
    );

    editorRef.current?.setData?.(nextHtml);
    editorHtmlRef.current = nextHtml;
    onEditorHtmlChange(nextHtml);
    setDirtySections(new Set(["document"]));

    window.requestAnimationFrame(() => {
      relayoutEditorPageBreaks(editorShellRef.current);
    });
  }, [documentStyle, onEditorHtmlChange, selectedTemplateId]);

  useEffect(() => {
    const shell = editorShellRef.current;
    if (!shell) return;

    const handleWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const toolbar = target?.closest(".ck-toolbar");
      const editorCanvas = target?.closest(".ck-editor__main");

      if (toolbar && shell.contains(toolbar)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!editorCanvas || !shell.contains(editorCanvas)) {
        return;
      }

      if (Math.abs(event.deltaY) < 1) return;

      event.preventDefault();
      event.stopPropagation();
      setZoom((currentZoom) => {
        const nextZoom = clampZoom(
          currentZoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
        );
        const zoomRatio = nextZoom / currentZoom;
        const shellRect = shell.getBoundingClientRect();
        const cursorX = event.clientX - shellRect.left;
        const cursorY = event.clientY - shellRect.top;
        const contentX = shell.scrollLeft + cursorX;
        const contentY = shell.scrollTop + cursorY;

        window.requestAnimationFrame(() => {
          shell.scrollLeft = contentX * zoomRatio - cursorX;
          shell.scrollTop = contentY * zoomRatio - cursorY;
        });

        return nextZoom;
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const target = event.target instanceof Element ? event.target : null;
      const editorCanvas = target?.closest(".ck-editor__main");
      const resumeContent = target?.closest(".ck-editor__editable");

      if (!editorCanvas || !shell.contains(editorCanvas) || resumeContent) {
        return;
      }

      event.preventDefault();
      canvasPanRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: shell.scrollLeft,
        scrollTop: shell.scrollTop,
      };
      shell.classList.add("is-panning");
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pan = canvasPanRef.current;
      if (!pan.active) return;

      event.preventDefault();
      shell.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
      shell.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
    };

    const stopPanning = () => {
      if (!canvasPanRef.current.active) return;

      canvasPanRef.current.active = false;
      shell.classList.remove("is-panning");
    };

    shell.addEventListener("wheel", handleWheel, { passive: false });
    shell.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", stopPanning);
    window.addEventListener("pointercancel", stopPanning);

    return () => {
      shell.removeEventListener("wheel", handleWheel);
      shell.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPanning);
      window.removeEventListener("pointercancel", stopPanning);
    };
  }, []);

  useEffect(() => {
    editorHtmlRef.current = editorHtml;
  }, [editorHtml]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      relayoutEditorPageBreaks(editorShellRef.current);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [documentStyle, editorHtml, selectedTemplateId, zoom]);

  useEffect(() => {
    if (generation?.editorDocumentStyle) {
      setDocumentStyle(normalizeResumeDocumentStyle(generation.editorDocumentStyle));
    }
  }, [generation?.editorDocumentStyle]);

  useEffect(() => {
    const templateId = generation?.editorTemplateId;
    setSelectedTemplateId(
      RESUME_TEMPLATE_CATALOGUE.some((entry) => entry.id === templateId)
        ? (templateId as ResumeTemplateId)
        : null,
    );
  }, [generation?.editorTemplateId]);

  useEffect(() => {
    let ignore = false;
    loadCKEditor().then((loadedEditor) => {
      if (ignore) return;
      setCkeditor(loadedEditor);
    });
    return () => { ignore = true; };
  }, []);

  const saveEditorHtml = useCallback(async () => {
    if (!generation) {
      showErrorToast("The tailored resume is still being created. Try saving after the stream completes.", {
        title: "Draft not ready yet",
      });
      return null;
    }

    const nextHtml = editorRef.current?.getData() ?? editorHtmlRef.current;
    setIsSaving(true);

    try {
      const response = await fetch(`/api/generations/${generation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editorHtml: nextHtml,
          editorDocumentStyle: documentStyle,
          editorTemplateId: selectedTemplateId ?? "base",
        }),
      });
      const payload = await readApiResponse<SaveResponse>(
        response,
        "We couldn't save the edited resume.",
      );

      if (!response.ok || !payload.generation) {
        throw new Error(payload.error ?? "We couldn't save the edited resume.");
      }

      onEditorHtmlChange(nextHtml);
      onGenerationSaved(payload.generation);
      setDirtySections(new Set());
      return payload.generation;
    } catch (saveError) {
      showErrorToast(
        saveError instanceof Error ? saveError.message : "We couldn't save the edited resume.",
        { title: "Resume edits couldn't be saved" },
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [documentStyle, generation, onEditorHtmlChange, onGenerationSaved, selectedTemplateId, showErrorToast]);

  const exportEditorDocument = useCallback(
    async (format: "pdf" | "docx") => {
      if (!generation) {
        showErrorToast("The tailored resume is still being created. Try downloading after the stream completes.", {
          title: "Download not ready yet",
        });
        return;
      }

      setExportingFormat(format);

      try {
        const nextHtml = editorRef.current?.getData() ?? editorHtmlRef.current;
        const isTemplatePdf = Boolean(selectedTemplateId && format === "pdf");

        const response = await fetch(`/api/generations/${generation.id}/editor-export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format,
            html: isTemplatePdf ? wrapResumeTemplateHtmlDocument(nextHtml) : nextHtml,
            editorHtml: nextHtml,
            documentStyle,
            rawHtmlDocument: isTemplatePdf,
          }),
        });
        await downloadFileResponse(
          response,
          getDownloadName(generation, format),
          "We couldn't export the edited resume.",
        );

        onEditorHtmlChange(nextHtml);
      } catch (exportError) {
        showErrorToast(
          exportError instanceof Error ? exportError.message : "We couldn't export the edited resume.",
          { title: "Resume export couldn't finish" },
        );
      } finally {
        setExportingFormat(null);
      }
    },
    [documentStyle, generation, onEditorHtmlChange, selectedTemplateId, showErrorToast],
  );

  const statusText =
    error ??
    (statusLabel ||
      (isStreaming ? "Streaming tailored sections..." : generation ? "Ready to edit" : "Preparing..."));

  const isExporting = exportingFormat !== null;

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[80]">
      <DialogBackdrop className="fixed inset-0 bg-[rgba(31,25,20,0.38)] backdrop-blur-sm" />
      <div className="fixed inset-0 overflow-y-auto p-3 sm:p-6">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel
            className="w-full max-w-[1480px] overflow-hidden rounded-[22px]"
            style={{
              background: THEME.paper,
              border: `1px solid ${THEME.rule}`,
              boxShadow: "0 28px 80px -48px rgba(31,25,20,0.55)",
              color: THEME.ink,
              ...documentStyleVariables,
            }}
          >
            {/* ── Global styles ── */}
            <style jsx global>{`
              /* ── Editor shell ────────────────────────────────────────────── */
              .tailored-resume-ckeditor-shell {
                --ck-z-default: 1;
                --ck-z-panel: 40;
                --ck-z-dialog: 60;
                background:
                  linear-gradient(90deg, rgba(255,255,255,0.42) 1px, transparent 1px),
                  linear-gradient(180deg, rgba(255,255,255,0.42) 1px, transparent 1px),
                  #e9dfcf;
                background-size: 24px 24px;
                overscroll-behavior: contain;
                scrollbar-width: none;
              }
              .tailored-resume-ckeditor-shell::-webkit-scrollbar {
                display: none;
              }
              .tailored-resume-ckeditor-shell .ck.ck-editor__main {
                cursor: grab;
                min-height: max(1040px, 100%);
                min-width: max-content;
              }
              .tailored-resume-ckeditor-shell.is-panning,
              .tailored-resume-ckeditor-shell.is-panning .ck.ck-editor__main {
                cursor: grabbing;
                user-select: none;
              }

              /* ── Ruler ───────────────────────────────────────────────────── */
              .tailored-resume-ruler {
                background-color: #f7efe2;
                color: #8c7d6b;
                font-family: var(--font-ibm-plex-mono), ui-monospace, monospace;
                font-size: 9px;
                font-weight: 700;
                position: absolute;
                user-select: none;
              }
              .tailored-resume-ruler-horizontal {
                background-image:
                  repeating-linear-gradient(90deg, transparent 0, transparent 23px, rgba(92,76,58,0.32) 23px, rgba(92,76,58,0.32) 24px),
                  repeating-linear-gradient(90deg, transparent 0, transparent 95px, rgba(92,76,58,0.52) 95px, rgba(92,76,58,0.52) 96px);
                border-bottom: 1px solid #d7c8b2;
                height: 28px;
                left: 32px;
                right: 0;
                top: 0;
              }
              .tailored-resume-ruler-horizontal span {
                position: absolute;
                top: 7px;
                transform: translateX(4px);
              }
              .tailored-resume-ruler-vertical {
                background-image:
                  repeating-linear-gradient(180deg, transparent 0, transparent 23px, rgba(92,76,58,0.32) 23px, rgba(92,76,58,0.32) 24px),
                  repeating-linear-gradient(180deg, transparent 0, transparent 95px, rgba(92,76,58,0.52) 95px, rgba(92,76,58,0.52) 96px);
                border-right: 1px solid #d7c8b2;
                bottom: 0;
                left: 0;
                top: 28px;
                width: 32px;
              }
              .tailored-resume-ruler-vertical span {
                left: 9px;
                position: absolute;
                transform: translateY(4px);
              }

              /* ── CKEditor chrome ─────────────────────────────────────────── */
              .tailored-resume-ckeditor .ck.ck-editor {
                display: flex;
                flex-direction: column;
                min-height: 100%;
              }
              .tailored-resume-ckeditor .ck.ck-editor__top .ck-sticky-panel__content,
              .tailored-resume-ckeditor .ck.ck-editor__top .ck-sticky-panel__content_sticky {
                z-index: 20 !important;
              }
              .tailored-resume-ckeditor .ck.ck-toolbar {
                border: 0;
                border-bottom: 1px solid #e4cfaa;
                border-radius: 0;
                background: #fffaf1;
                padding: 8px 10px;
                position: sticky;
                top: 0;
                z-index: 20;
              }
              .tailored-resume-ckeditor .ck.ck-toolbar .ck-dropdown__panel,
              .tailored-resume-ckeditor .ck.ck-dropdown .ck-dropdown__panel {
                z-index: 45 !important;
              }
              .tailored-resume-ckeditor .ck.ck-editor__main {
                background: transparent;
                display: grid;
                place-items: start center;
                padding: 42px 34px 48px 66px;
                zoom: var(--tb-zoom, 1);
              }
              .tailored-resume-ckeditor .ck-editor__editable {
                color: var(--resume-color-text);
                cursor: text;
                font-family: var(--resume-document-font);
                font-size: var(--resume-summary-size);
                line-height: 1.42;
                max-width: var(--resume-page-width);
                min-height: var(--resume-page-min-height);
                padding: var(--resume-margin-top) var(--resume-margin-right) var(--resume-margin-bottom) var(--resume-margin-left) !important;
                width: min(var(--resume-page-width), 100%);
              }
              /* ── Custom-template mode overrides ─────────────────────────────── */
              /* When a resume template is applied the editable must not apply      */
              /* document-style padding or page-width constraints because the        */
              /* template already defines its own layout (816 px fixed-width pages). */
              /* Stripping these prevents the template content overflowing the       */
              /* padded editable and causing unwanted horizontal scroll.             */
              .tailored-resume-ckeditor.is-custom-template .ck.ck-editor__main {
                padding: 24px 24px 40px 24px;
              }
              .tailored-resume-ckeditor.is-custom-template .ck-editor__editable {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                max-width: none !important;
                min-height: 0 !important;
                padding: 0 !important;
                width: fit-content !important;
              }
              .tailored-resume-ckeditor.is-custom-template .ck-editor__editable.ck-focused {
                border-color: transparent !important;
                box-shadow: none !important;
              }
              .tailored-resume-ckeditor.is-custom-template .ck-editor__editable .rt-page {
                background: #fff;
                flex: 0 0 auto;
                min-height: 1056px !important;
                overflow: visible !important;
                width: 816px !important;
              }
              .tailored-resume-ckeditor .ck-editor__editable.ck-focused {
                border-color: #aeb9bb !important;
                box-shadow:
                  0 0 0 2px rgba(89,106,64,0.12),
                  0 18px 36px -24px rgba(31,25,20,0.55),
                  0 3px 14px rgba(31,25,20,0.12) !important;
              }
              /* ── Resume content typography ───────────────────────────────── */
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable h1,
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .resume-name {
                color: var(--resume-color-heading);
                font-size: var(--resume-name-size);
                font-weight: var(--resume-name-weight);
                letter-spacing: var(--resume-name-letter-spacing);
                line-height: var(--resume-name-line-height);
                margin: 0 0 var(--resume-name-margin-bottom);
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .role-title {
                color: var(--resume-color-accent);
                font-size: var(--resume-role-size);
                font-weight: var(--resume-role-weight);
                letter-spacing: var(--resume-role-letter-spacing);
                line-height: var(--resume-role-line-height);
                margin: 0 0 var(--resume-role-margin-bottom);
                text-transform: uppercase;
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .contact-line {
                color: var(--resume-color-secondary);
                font-size: var(--resume-contact-size);
                line-height: var(--resume-contact-line-height);
                margin: 0 0 var(--resume-contact-margin-bottom);
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable h2,
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .section-title {
                border-bottom: 2px solid var(--resume-color-divider);
                color: var(--resume-color-accent);
                font-size: var(--resume-section-title-size);
                font-weight: var(--resume-section-title-weight);
                letter-spacing: var(--resume-section-title-letter-spacing);
                line-height: var(--resume-section-title-line-height);
                margin: var(--resume-section-title-margin-top) 0 var(--resume-section-title-margin-bottom);
                padding-bottom: var(--resume-section-title-padding-bottom);
                text-transform: uppercase;
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable h3,
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .job-title {
                color: var(--resume-color-heading);
                font-size: var(--resume-job-title-size);
                font-weight: 700;
                line-height: 1.25;
                margin: var(--resume-item-gap) 0 2pt;
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable p {
                font-size: var(--resume-bullet-size);
                margin: 0 0 var(--resume-paragraph-gap);
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .skill-line {
                color: var(--resume-color-text);
                font-size: var(--resume-skill-item-size);
                line-height: 1.5;
                margin: 0 0 var(--resume-skill-group-gap);
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .skill-line strong {
                color: var(--resume-color-accent);
                font-size: var(--resume-skill-category-size);
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable section[data-tailor-section="profile"] {
                border-bottom: 3px solid var(--resume-color-accent);
                padding-bottom: 8pt;
                margin-bottom: 4pt;
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .experience-meta {
                color: var(--resume-color-muted);
                font-size: var(--resume-meta-size);
                margin-bottom: 3pt;
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .resume-skills-grid {
                column-gap: var(--resume-skill-column-gap);
                display: grid;
                grid-template-columns: 1fr 1fr;
                margin-top: 2pt;
                row-gap: var(--resume-skill-row-gap);
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .resume-skills-grid[data-column-count="1"] {
                grid-template-columns: 1fr;
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .resume-skills-column {
                min-width: 0;
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .resume-skill-group {
                break-inside: avoid;
                margin-bottom: var(--resume-skill-group-gap);
                page-break-inside: avoid;
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .resume-skill-label {
                color: var(--resume-color-heading);
                font-size: var(--resume-skill-category-size);
                font-weight: 700;
                letter-spacing: 0;
                line-height: var(--resume-skill-category-line-height);
                margin-bottom: var(--resume-skill-category-margin-bottom);
              }
              .tailored-resume-ckeditor.is-base-template .ck-editor__editable .resume-skill-items {
                color: var(--resume-color-skill-text);
                font-size: var(--resume-skill-item-size);
                font-weight: 400;
                line-height: var(--resume-skill-line-height);
                margin: 0;
              }
              @media screen and (max-width: 640px) {
                .tailored-resume-ckeditor.is-base-template .ck-editor__editable .resume-skills-grid {
                  grid-template-columns: 1fr;
                }
              }
              .tailored-resume-ckeditor .ck .ck-page-break {
                border-top: 1px dashed #aeb9bb;
                margin: 28px 0;
              }
              .tailored-resume-ckeditor .ck-editor__editable .page-break {
                clear: both;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-left: calc(-1 * var(--resume-margin-left));
                margin-right: calc(-1 * var(--resume-margin-right));
                position: relative;
              }
              .tailored-resume-ckeditor .ck-editor__editable .page-break::after {
                border-bottom: 2px dashed #aeb9bb;
                content: "";
                left: 0;
                position: absolute;
                right: 0;
                top: 50%;
              }
              .tailored-resume-ckeditor .ck-editor__editable .page-break__label {
                background: #fffaf1;
                border: 1px solid #aeb9bb;
                border-radius: 2px;
                box-shadow: 2px 2px 1px rgba(0, 0, 0, 0.14);
                color: #41342c;
                font-size: 10px;
                font-weight: 700;
                padding: 4px 7px;
                position: relative;
                text-transform: uppercase;
                z-index: 1;
              }
              /* ── Unified toolbar ─────────────────────────────────────────── */
              .tb-editor-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
                height: auto;
                min-height: 52px;
                padding: 8px 14px;
                background: oklch(0.965 0.015 80);
                border-bottom: 1px solid oklch(0.88 0.012 80);
                font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
              }
              .tb-group {
                display: flex;
                align-items: center;
                gap: 4px;
              }
              .tb-divider {
                width: 1px;
                height: 20px;
                background: oklch(0.92 0.010 80);
                margin: 0 6px;
                flex-shrink: 0;
              }
              .resume-color-theme-controls {
                align-items: center;
                display: inline-flex;
                gap: 8px;
              }
              .resume-color-theme-dot {
                border: 1px solid rgba(31,25,20,0.22);
                border-radius: 999px;
                box-shadow: 0 1px 3px rgba(31,25,20,0.18);
                display: inline-block;
                height: 14px;
                width: 14px;
                flex-shrink: 0;
              }
              .resume-color-theme-menu-label {
                align-items: center;
                display: inline-flex;
                gap: 8px;
                min-width: 0;
              }
              /* Generic dropdown trigger */
              .tb-trigger {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                height: 32px;
                padding: 0 10px;
                border: 1px solid transparent;
                border-radius: 7px;
                background: transparent;
                color: oklch(0.28 0.010 80);
                font-size: 13px;
                font-weight: 500;
                letter-spacing: -0.01em;
                cursor: pointer;
                transition: background 120ms ease, border-color 120ms ease;
                font-family: inherit;
              }
              .tb-trigger:hover { background: oklch(0.94 0.018 80); }
              .tb-trigger:focus-visible {
                outline: none;
                border-color: oklch(0.62 0.13 55);
                background: oklch(0.985 0.008 80);
              }
              .tb-trigger-label { white-space: nowrap; }
              /* Dropdown menu */
              .tb-menu {
                position: absolute;
                top: calc(100% + 6px);
                min-width: 160px;
                background: oklch(0.985 0.008 80);
                border: 1px solid oklch(0.88 0.012 80);
                border-radius: 10px;
                box-shadow: 0 8px 24px oklch(0.20 0.02 80 / 0.10), 0 2px 6px oklch(0.20 0.02 80 / 0.06);
                padding: 4px;
                z-index: 100;
                max-height: 320px;
                overflow-y: auto;
              }
              .tb-menu-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                padding: 7px 10px;
                background: transparent;
                border: none;
                border-radius: 6px;
                color: oklch(0.28 0.010 80);
                font-size: 13px;
                font-weight: 400;
                text-align: left;
                cursor: pointer;
                white-space: nowrap;
                font-family: inherit;
              }
              .tb-menu-item:hover { background: oklch(0.94 0.018 80); }
              .tb-menu-item.is-selected {
                background: oklch(0.94 0.04 55);
                color: oklch(0.42 0.14 55);
                font-weight: 500;
              }
              /* Icon buttons (zoom +/−) */
              .tb-icon-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border: none;
                border-radius: 6px;
                background: transparent;
                color: oklch(0.50 0.012 80);
                cursor: pointer;
                transition: background 120ms ease, color 120ms ease;
                font-family: inherit;
              }
              .tb-icon-btn:hover:not(:disabled) {
                background: oklch(0.94 0.018 80);
                color: oklch(0.28 0.010 80);
              }
              .tb-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
              /* Zoom cluster */
              .tb-zoom {
                display: inline-flex;
                align-items: center;
                gap: 2px;
                background: oklch(0.985 0.008 80);
                border: 1px solid oklch(0.88 0.012 80);
                border-radius: 8px;
                padding: 2px;
              }
              .tb-zoom-value {
                min-width: 52px;
                height: 28px;
                border: none;
                background: transparent;
                color: oklch(0.28 0.010 80);
                font-family: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
                font-size: 12px;
                font-weight: 500;
                letter-spacing: -0.02em;
                cursor: pointer;
                border-radius: 5px;
                font-variant-numeric: tabular-nums;
              }
              .tb-zoom-value:hover { background: oklch(0.94 0.018 80); }
              /* Toggle (HTML Draft) */
              .tb-toggle {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                height: 32px;
                padding: 0 12px;
                border: 1px solid oklch(0.88 0.012 80);
                border-radius: 7px;
                background: oklch(0.985 0.008 80);
                color: oklch(0.50 0.012 80);
                font-size: 12.5px;
                font-weight: 500;
                letter-spacing: -0.005em;
                cursor: pointer;
                transition: all 120ms ease;
                font-family: inherit;
              }
              .tb-toggle:hover { background: oklch(0.94 0.018 80); color: oklch(0.28 0.010 80); }
              .tb-toggle.is-on {
                background: oklch(0.94 0.04 55);
                border-color: oklch(0.85 0.06 55);
                color: oklch(0.42 0.14 55);
              }
              .tb-toggle-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: oklch(0.62 0.010 80);
                transition: background 120ms ease, box-shadow 120ms ease;
                flex-shrink: 0;
              }
              .tb-toggle.is-on .tb-toggle-dot {
                background: oklch(0.62 0.13 55);
                box-shadow: 0 0 0 3px oklch(0.62 0.13 55 / 0.18);
              }
              /* Ghost button (Save) */
              .tb-ghost-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                height: 32px;
                padding: 0 12px;
                border: 1px solid oklch(0.88 0.012 80);
                border-radius: 7px;
                background: oklch(0.985 0.008 80);
                color: oklch(0.28 0.010 80);
                font-size: 12.5px;
                font-weight: 500;
                letter-spacing: -0.005em;
                cursor: pointer;
                transition: all 120ms ease;
                font-family: inherit;
              }
              .tb-ghost-btn:hover {
                background: oklch(0.94 0.018 80);
                border-color: oklch(0.82 0.014 80);
              }
              .tb-ghost-btn:disabled { opacity: 0.5; cursor: not-allowed; }
              /* Split button (Download) */
              .tb-split {
                position: relative;
                display: inline-flex;
                align-items: stretch;
                height: 32px;
                border-radius: 7px;
                overflow: visible;
              }
              .tb-split-main, .tb-split-caret {
                border: 1px solid oklch(0.88 0.012 80);
                background: oklch(0.985 0.008 80);
                color: oklch(0.28 0.010 80);
                cursor: pointer;
                transition: background 120ms ease, border-color 120ms ease;
                font-family: inherit;
              }
              .tb-split-main {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                padding: 0 12px 0 11px;
                border-radius: 7px 0 0 7px;
                border-right: none;
                font-size: 12.5px;
                font-weight: 500;
                letter-spacing: -0.005em;
              }
              .tb-split-caret {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                border-radius: 0 7px 7px 0;
                color: oklch(0.50 0.012 80);
              }
              .tb-split-main:hover, .tb-split-caret:hover {
                background: oklch(0.94 0.018 80);
              }
              .tb-split-main:disabled, .tb-split-caret:disabled {
                opacity: 0.5;
                cursor: not-allowed;
              }
              /* Primary (clay fill) split button */
              .tb-split.is-primary .tb-split-main,
              .tb-split.is-primary .tb-split-caret {
                background: oklch(0.62 0.13 55);
                border-color: oklch(0.62 0.13 55);
                color: oklch(0.99 0.01 80);
              }
              .tb-split.is-primary .tb-split-main:hover,
              .tb-split.is-primary .tb-split-caret:hover {
                background: oklch(0.56 0.14 55);
                border-color: oklch(0.56 0.14 55);
              }
              .tb-split.is-primary .tb-split-caret {
                border-left: 1px solid oklch(0.56 0.14 55);
              }
              ${RESUME_TEMPLATE_PICKER_STYLES}
            `}</style>

            {/* ── Modal header ── */}
            <div
              className="flex flex-wrap items-start justify-between gap-4 p-5"
              style={{ borderBottom: `1px solid ${THEME.ruleSoft}`, background: THEME.paperWarm }}
            >
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: THEME.moss }}>
                  Tailored resume editor
                </p>
                <DialogTitle className="mt-2 font-[var(--font-fraunces)] text-3xl font-semibold tracking-tight">
                  Review and edit while tailoring runs
                </DialogTitle>
                <p className="mt-2 text-sm font-semibold" style={{ color: error ? THEME.danger : THEME.ink3 }}>
                  {statusText}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {generation && onOpenEditPage ? (
                  <ModalButton onClick={() => onOpenEditPage(generation.id)}>
                    Open full edit page
                  </ModalButton>
                ) : null}
                {task &&
                (task.status === "pending" || task.status === "running" || task.status === "streaming") ? (
                  <ModalButton tone="danger" onClick={onCancelGeneration}>
                    Cancel generation
                  </ModalButton>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-10 w-10 place-items-center rounded-[12px]"
                  style={{ border: `1px solid ${THEME.rule}`, background: "#fff", color: THEME.ink3 }}
                  aria-label="Close tailored resume editor"
                >
                  ×
                </button>
              </div>
            </div>

            {/* ── Progress bar ── */}
            <div className="px-5 pt-4">
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ background: THEME.ruleSoft }}
                aria-label="Tailoring progress"
              >
                <div
                  className="h-full transition-[width]"
                  style={{
                    width: `${Math.max(4, Math.min(100, progress))}%`,
                    background: error ? THEME.danger : THEME.moss,
                  }}
                />
              </div>
              <div
                className="mt-2 flex flex-wrap justify-between gap-2 text-xs font-bold uppercase tracking-[0.16em]"
                style={{ color: THEME.ink3 }}
              >
                <span>{task?.stageLabel ?? statusLabel}</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>

            {/* ── Editor grid ── */}
            <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div
                ref={editorShellRef}
                className={`tailored-resume-ckeditor tailored-resume-ckeditor-shell ${selectedTemplateId ? "is-custom-template" : "is-base-template"} h-[700px] overflow-auto rounded-[10px]`}
                style={{
                  border: `1px solid ${THEME.ruleSoft}`,
                  "--tb-zoom": zoom / 100,
                } as CSSProperties}
              >
                {/* ── Unified toolbar (always CKEditor mode) ── */}
                <div className="tb-editor-bar">
                  <div className="tb-group">
                    <TbMenu
                      value={currentPageLabel}
                      options={pageSizeOptions}
                      onSelect={(key) =>
                        setDocumentStyle((prev) => ({ ...prev, pageSize: key as ResumePageSize }))
                      }
                    />
                    <div className="tb-divider" />
                    <TbMenu
                      value={currentMarginLabel}
                      options={marginOptions}
                      minWidth={108}
                      onSelect={(key) =>
                        setDocumentStyle((prev) => ({
                          ...prev,
                          marginPreset: key as ResumeMarginPreset,
                          margins: RESUME_MARGIN_PRESETS[key as ResumeMarginPreset]?.margins ?? prev.margins,
                        }))
                      }
                    />
                    <div className="tb-divider" />
                    <TbMenu
                      value={currentFontLabel}
                      options={fontOptions}
                      minWidth={126}
                      onSelect={(key) =>
                        setDocumentStyle((prev) => ({ ...prev, fontFamily: key }))
                      }
                    />
                    <div className="tb-divider" />
                    <ResumeColorThemeControls
                      value={documentStyle.colors}
                      onChange={(colors) => setDocumentStyle((prev) => ({ ...prev, colors }))}
                    />
                    <div className="tb-divider" />
                    <button
                      type="button"
                      className="tb-ghost-btn"
                      onClick={() => setIsTemplateModalOpen(true)}
                      disabled={!generation}
                    >
                      <TbIcon name="layout" size={13} />
                      <span>{selectedTemplateLabel}</span>
                    </button>
                    <button
                      type="button"
                      className="tb-ghost-btn"
                      onClick={applyAutoPageBreaks}
                    >
                      <TbIcon name="autoBreak" size={13} />
                      <span>Auto breaks</span>
                    </button>
                  </div>
                  <div className="tb-group">
                    <TbZoom zoom={zoom} setZoom={setZoom} />
                    <div className="tb-divider" />
                    <button
                      type="button"
                      className={`tb-toggle${draftMode ? " is-on" : ""}`}
                      onClick={() => setDraftMode((d) => !d)}
                    >
                      <span className="tb-toggle-dot" />
                      HTML Draft
                    </button>
                    <div className="tb-divider" />
                    <button
                      type="button"
                      className="tb-ghost-btn"
                      onClick={() => void saveEditorHtml()}
                      disabled={!generation || isSaving || isExporting}
                    >
                      <TbIcon name="save" size={13} />
                      <span>{isSaving ? "Saving…" : "Save"}</span>
                    </button>
                    <TbActionMenu
                      primary
                      primaryLabel={isExporting ? "Exporting…" : "Download"}
                      primaryIcon="download"
                      onPrimary={() => void exportEditorDocument("pdf")}
                      disabled={!generation || isExporting}
                      items={[
                        { label: "Download as PDF", icon: "download", hint: ".pdf", onClick: () => void exportEditorDocument("pdf") },
                        { label: "Download as DOCX", icon: "download", hint: ".docx", onClick: () => void exportEditorDocument("docx") },
                      ]}
                    />
                  </div>
                </div>

                {/* ── Content area: CKEditor (always editable) ── */}
                {ckeditor ? (
                  <div className="relative">
                    <HorizontalRuler />
                    <VerticalRuler />
                    <ckeditor.Component
                      editor={ckeditor.ClassicEditor}
                      data={editorHtml}
                      disabled={false}
                      config={{
                        licenseKey: "GPL",
                        plugins: ckeditor.plugins,
                        htmlSupport: {
                          allow: [
                            {
                              name: /^(section|div|p|ul|ol|li|h1|h2|h3|a|strong|em|span|br)$/,
                              classes: true,
                              attributes: true,
                              styles: true,
                            },
                          ],
                        },
                        fontFamily: {
                          options: [
                            "default",
                            ...RESUME_FONT_OPTIONS.map((font) => font.value),
                            "Courier New, Courier, monospace",
                          ],
                        },
                        fontSize: {
                          options: [10, 11, 12, 14, "default", 16, 18, 20, 24],
                        },
                        toolbar: {
                          shouldNotGroupWhenFull: false,
                          items: [
                            "undo", "redo", "|",
                            "findAndReplace", "selectAll", "|",
                            "heading", "fontFamily", "fontSize", "|",
                            "bold", "italic", "fontColor", "fontBackgroundColor", "removeFormat", "|",
                            "alignment", "outdent", "indent", "|",
                            "bulletedList", "numberedList", "link", "pageBreak",
                          ],
                        },
                      }}
                      onReady={(editor) => {
                        editorRef.current = editor;
                        window.requestAnimationFrame(() => {
                          relayoutEditorPageBreaks(editorShellRef.current);
                        });
                      }}
                      onChange={(_event, editor) => {
                        const nextHtml = editor.getData();
                        onEditorHtmlChange(nextHtml);
                        if (!isStreaming) setDirtySections(new Set(["document"]));
                        window.requestAnimationFrame(() => {
                          relayoutEditorPageBreaks(editorShellRef.current);
                        });
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="grid min-h-[680px] place-items-center text-sm font-semibold"
                    style={{ color: THEME.ink3 }}
                  >
                    Loading CKEditor…
                  </div>
                )}
              </div>

              {/* ── Sidebar panel (tabs: Sections / Templates) ── */}
              <aside
                className="rounded-[10px] overflow-hidden flex flex-col"
                style={{ border: `1px solid ${THEME.ruleSoft}`, background: THEME.paperWarm }}
              >
                {/* Section navigation */}
                <div
                  className="px-4 py-3"
                  style={{ borderBottom: `1px solid ${THEME.ruleSoft}` }}
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: THEME.moss }}>
                    Sections
                  </p>
                </div>

                {/* Tab: Sections */}
                <div className="p-4 flex-1">
                    {sections.length ? (
                      <>
                        <p className="mb-2 text-[10px] font-semibold leading-5" style={{ color: THEME.ink3 }}>
                          Click to jump to that section
                        </p>
                        <div className="space-y-1.5">
                          {sections
                            .filter((section) => section.section !== "template")
                            .map((section) => {
                              const isActive = activeSection === section.section;
                              return (
                                <button
                                  key={section.section}
                                  type="button"
                                  onClick={() => scrollToSection(section.section)}
                                  className="w-full rounded-[8px] px-3 py-2 text-left text-sm font-semibold transition-all"
                                  style={{
                                    background: isActive ? THEME.paperWarm : "#fff",
                                    border: isActive
                                      ? `1.5px solid ${THEME.moss}`
                                      : `1px solid ${THEME.ruleSoft}`,
                                    color: isActive ? THEME.moss : THEME.ink2,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  {/* Anchor icon */}
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 12 12"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    style={{ flexShrink: 0, opacity: isActive ? 1 : 0.4 }}
                                  >
                                    <circle cx="6" cy="3" r="1.5" />
                                    <path d="M6 5v5M3.5 7.5l2.5 2.5 2.5-2.5" />
                                  </svg>
                                  {section.section.replace(/-/g, " ")}
                                </button>
                              );
                            })}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm leading-6" style={{ color: THEME.ink3 }}>
                        Sections will appear here as the tailored resume is prepared.
                      </p>
                    )}
                    {dirtySections.size ? (
                      <p className="mt-4 text-xs leading-5" style={{ color: THEME.ink3 }}>
                        Manual edits detected. Incoming stream updates will append new sections without
                        resetting your current text.
                      </p>
                    ) : null}
                </div>

              </aside>
            </div>

            <ResumeTemplatePickerModal
              open={isTemplateModalOpen}
              data={toTemplateData(getBaseResumeData())}
              activeId={selectedTemplateId}
              onClose={() => setIsTemplateModalOpen(false)}
              onDefault={() => {
                void applyEditorTemplate(null).then(() => setIsTemplateModalOpen(false));
              }}
              onSelect={(id) => {
                void applyEditorTemplate(id).then(() => setIsTemplateModalOpen(false));
              }}
            />

          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
