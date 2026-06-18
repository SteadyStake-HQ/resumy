"use client";

import {
  RESUME_TEMPLATE_CATALOGUE,
  ResumeTemplatePreviewCard,
  type ResumeTemplateId,
  type TemplateData,
} from "@/components/resume-templates";

export function ResumeTemplatePickerModal({
  open,
  data,
  activeId,
  onClose,
  onSelect,
  onDefault,
}: {
  open: boolean;
  data: TemplateData;
  activeId: ResumeTemplateId | null;
  onClose: () => void;
  onSelect: (id: ResumeTemplateId) => void;
  onDefault: () => void;
}) {
  if (!open) return null;

  return (
    <div className="resume-template-modal-overlay" role="presentation">
      <div className="resume-template-modal-backdrop" onClick={onClose} />
      <div
        className="resume-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-template-picker-title"
      >
        <div className="resume-template-modal-header">
          <div>
            <p>Templates</p>
            <h2 id="resume-template-picker-title">Choose resume layout</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close template picker">
            x
          </button>
        </div>
        <button
          type="button"
          className={`resume-template-default${activeId ? "" : " is-active"}`}
          onClick={onDefault}
        >
          <strong>Default editable template</strong>
          <span>Structured resume editor layout</span>
        </button>
        <div className="resume-template-grid">
          {RESUME_TEMPLATE_CATALOGUE.map((entry) => (
            <ResumeTemplatePreviewCard
              key={entry.id}
              id={entry.id}
              data={data}
              active={activeId === entry.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const RESUME_TEMPLATE_PICKER_STYLES = `
  .resume-template-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .resume-template-modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(31, 25, 20, 0.48);
    backdrop-filter: blur(5px);
  }
  .resume-template-modal {
    position: relative;
    z-index: 1;
    width: min(1040px, 100%);
    max-height: min(820px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid #e4cfaa;
    border-radius: 18px;
    background: #fffaf1;
    box-shadow: 0 30px 90px -46px rgba(31, 25, 20, 0.66);
    display: flex;
    flex-direction: column;
  }
  .resume-template-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid #eadcc7;
    padding: 18px 20px 16px;
  }
  .resume-template-modal-header p {
    margin: 0 0 6px;
    color: #596a40;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  .resume-template-modal-header h2 {
    margin: 0;
    color: #1f1914;
    font-size: 22px;
    font-weight: 800;
    line-height: 1.15;
  }
  .resume-template-modal-header button {
    width: 32px;
    height: 32px;
    border: 1px solid #eadcc7;
    border-radius: 8px;
    background: #fff;
    color: #41342c;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }
  .resume-template-default {
    margin: 14px 20px 0;
    border: 2px solid #eae5dc;
    border-radius: 10px;
    background: #fff;
    color: #1f1914;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 13px 14px;
    text-align: left;
  }
  .resume-template-default.is-active,
  .resume-template-card.is-active {
    border-color: #596a40;
    box-shadow: 0 0 0 3px rgba(89, 106, 64, 0.16);
  }
  .resume-template-default strong {
    font-size: 14px;
  }
  .resume-template-default span {
    color: #74675d;
    font-size: 12px;
    font-weight: 600;
  }
  .resume-template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 14px;
    overflow-y: auto;
    padding: 14px 20px 20px;
  }
  .resume-template-card {
    border: 2px solid #eae5dc;
    border-radius: 10px;
    background: #fff;
    color: #1f1914;
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    text-align: left;
  }
  .resume-template-card-preview {
    display: block;
    height: 180px;
    overflow: hidden;
    background: #f3f3f0;
    border-bottom: 1px solid #eadcc7;
    position: relative;
  }
  .resume-template-card-scale {
    display: block;
    transform: scale(0.162);
    transform-origin: top left;
    width: 816px;
    pointer-events: none;
  }
  .resume-template-card-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 13px 13px;
  }
  .resume-template-card-copy strong {
    font-size: 13px;
    font-weight: 800;
  }
  .resume-template-card-copy small {
    color: #74675d;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
  }
`;
