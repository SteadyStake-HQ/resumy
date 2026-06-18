"use client";

import type { ReactNode } from "react";
import {
  RESUME_FONT_OPTIONS,
  RESUME_MARGIN_PRESETS,
  RESUME_PAGE_SIZES,
  type ResumeDocumentStyle,
  type ResumeMarginPreset,
  type ResumePageSize,
} from "@/lib/resume-document-style";

type ResumeDocumentStyleControlsProps = {
  value: ResumeDocumentStyle;
  onChange: (value: ResumeDocumentStyle) => void;
  compact?: boolean;
};

const marginFields = [
  ["top", "Top"],
  ["right", "Right"],
  ["bottom", "Bottom"],
  ["left", "Left"],
] as const;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#74675d]">
      {children}
    </label>
  );
}

export function ResumeDocumentStyleControls({
  value,
  onChange,
  compact = false,
}: ResumeDocumentStyleControlsProps) {
  const updatePreset = (preset: ResumeMarginPreset) => {
    onChange({
      ...value,
      marginPreset: preset,
      margins:
        preset === "custom"
          ? value.margins
          : RESUME_MARGIN_PRESETS[preset].margins,
    });
  };

  return (
    <div className={`flex flex-wrap items-end gap-2 ${compact ? "text-xs" : ""}`}>
      <FieldLabel>
        Size
        <select
          value={value.pageSize}
          onChange={(event) =>
            onChange({ ...value, pageSize: event.target.value as ResumePageSize })
          }
          className="h-9 rounded-md border border-[#e4cfaa] bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#1f1914]"
        >
          {Object.entries(RESUME_PAGE_SIZES).map(([key, page]) => (
            <option key={key} value={key}>
              {page.label}
            </option>
          ))}
        </select>
      </FieldLabel>

      <FieldLabel>
        Margins
        <select
          value={value.marginPreset}
          onChange={(event) => updatePreset(event.target.value as ResumeMarginPreset)}
          className="h-9 rounded-md border border-[#e4cfaa] bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#1f1914]"
        >
          {Object.entries(RESUME_MARGIN_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label}
            </option>
          ))}
        </select>
      </FieldLabel>

      {value.marginPreset === "custom" ? (
        <div className="flex flex-wrap items-end gap-1">
          {marginFields.map(([key, label]) => (
            <FieldLabel key={key}>
              {label}
              <input
                type="number"
                min="0.25"
                max="3"
                step="0.05"
                value={value.margins[key]}
                onChange={(event) =>
                  onChange({
                    ...value,
                    margins: {
                      ...value.margins,
                      [key]: event.target.valueAsNumber || value.margins[key],
                    },
                  })
                }
                className="h-9 w-16 rounded-md border border-[#e4cfaa] bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#1f1914]"
              />
            </FieldLabel>
          ))}
        </div>
      ) : null}

      <FieldLabel>
        Font
        <select
          value={value.fontFamily}
          onChange={(event) => onChange({ ...value, fontFamily: event.target.value })}
          className="h-9 min-w-36 rounded-md border border-[#e4cfaa] bg-white px-2 text-xs font-bold normal-case tracking-normal text-[#1f1914]"
        >
          {RESUME_FONT_OPTIONS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </FieldLabel>
    </div>
  );
}
