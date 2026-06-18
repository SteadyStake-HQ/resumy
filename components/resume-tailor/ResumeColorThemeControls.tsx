"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  RESUME_COLOR_THEME_PRESETS,
  type ResumeDocumentColors,
} from "@/lib/resume-document-style";

type ResumeColorThemeControlsProps = {
  value: ResumeDocumentColors;
  onChange: (colors: ResumeDocumentColors) => void;
};

export function ResumeColorThemeControls({
  value,
  onChange,
}: ResumeColorThemeControlsProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const currentThemeLabel = useMemo(() => {
    const matchedTheme = RESUME_COLOR_THEME_PRESETS.find((preset) =>
      Object.entries(preset.colors).every(([key, presetColor]) => {
        const colorKey = key as keyof ResumeDocumentColors;
        const current = value[colorKey]?.toUpperCase();
        return current === presetColor;
      }),
    );

    return matchedTheme?.label ?? "Custom theme";
  }, [value]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updateMenuPosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuStyle({
        left: rect.left,
        minWidth: Math.max(190, rect.width),
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
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const applyPreset = (presetKey: string) => {
    const preset = RESUME_COLOR_THEME_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    onChange(preset.colors as ResumeDocumentColors);
    setOpen(false);
  };

  return (
    <div className="resume-color-theme-controls" aria-label="Resume color theme controls">
      <div ref={triggerRef} style={{ position: "relative" }}>
        <button
          type="button"
          className="tb-trigger"
          style={{ minWidth: 126 }}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="resume-color-theme-dot" style={{ background: value.accent }} />
          <span className="tb-trigger-label">{currentThemeLabel}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            style={{ flexShrink: 0, color: "oklch(0.62 0.010 80)" }}
            aria-hidden="true"
          >
            <path
              d="M2 4 L5 7 L8 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {open && menuStyle && createPortal(
          <div ref={menuRef} className="tb-menu" style={menuStyle} role="menu">
            {RESUME_COLOR_THEME_PRESETS.map((preset) => {
              const selected = preset.label === currentThemeLabel;
              return (
                <button
                  key={preset.key}
                  type="button"
                  className={`tb-menu-item${selected ? " is-selected" : ""}`}
                  onClick={() => applyPreset(preset.key)}
                  role="menuitem"
                >
                  <span className="resume-color-theme-menu-label">
                    <span
                      className="resume-color-theme-dot"
                      style={{ background: preset.colors.accent }}
                    />
                    {preset.label}
                  </span>
                  {selected ? (
                    <span aria-hidden="true" style={{ fontSize: 12 }}>
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
      </div>

    </div>
  );
}
