"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ResumeTemplate } from "./ResumeTemplateSet";
import type { ResumeTemplateId, TemplateData } from "./resume-template-types";

const TEMPLATE_DOCUMENT_CSS = `
  html, body { margin: 0; padding: 0; background: #f3f3f0; }
  body { font-family: Inter, Arial, sans-serif; }
  * { box-sizing: border-box; }
  .rt-template-document { align-items: center; display: flex; flex-direction: column; padding: 0; }
  .rt-template-flow { align-items: center !important; display: flex !important; flex-direction: column !important; width: 8.5in !important; }
  .rt-page { background: #fff; box-shadow: none !important; min-height: 11in !important; width: 8.5in !important; }
  @page { size: letter; margin: 0; }
  @media print {
    body { background: #fff; }
    .rt-template-flow { gap: 0 !important; }
    .page-break { display: none !important; }
    .rt-page { break-after: page; break-inside: auto; page-break-after: always; }
    .rt-page:last-child { break-after: auto; page-break-after: auto; }
  }
`;

export function renderResumeTemplateToHtml(templateId: ResumeTemplateId, data: TemplateData) {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => {
    root.render(
      <div className="rt-template-document" data-resume-template-id={templateId}>
        <ResumeTemplate id={templateId} data={data} />
      </div>,
    );
  });
  const html = host.innerHTML;
  root.unmount();
  return html;
}

export function wrapResumeTemplateHtmlDocument(bodyHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${TEMPLATE_DOCUMENT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}
