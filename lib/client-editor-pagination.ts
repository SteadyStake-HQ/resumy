"use client";

import {
  RESUME_PAGE_SIZES,
  getResumeStyleCssVariables,
  type ResumeDocumentStyle,
} from "@/lib/resume-document-style";

const PX_PER_INCH = 96;
const MIN_PAGE_BREAK_SPACER_PX = 44;
const PAGE_BREAK_HTML =
  '<div class="page-break" style="page-break-after: always"><span style="display: none">&nbsp;</span></div>';
const TEMPLATE_PAGE_HEIGHT_PX = 1056;

function stripPageBreaks(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll(".page-break").forEach((node) => node.remove());
  return template.innerHTML;
}

function getElementBottom(element: HTMLElement, root: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return elementRect.bottom - rootRect.top;
}

function getUnitBottom(element: HTMLElement, root: HTMLElement) {
  let bottom = getElementBottom(element, root);

  if (element.matches("h3, .job-title")) {
    let sibling = element.nextElementSibling as HTMLElement | null;

    while (
      sibling &&
      !sibling.matches("h2, h3, .section-title, .job-title, .page-break")
    ) {
      bottom = Math.max(bottom, getElementBottom(sibling, root));
      sibling = sibling.nextElementSibling as HTMLElement | null;
    }
  }

  return bottom;
}

function collectBreakCandidates(root: HTMLElement) {
  const candidates: HTMLElement[] = [];

  Array.from(root.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child.classList.contains("page-break")) {
      return;
    }

    const sectionName = child.getAttribute("data-tailor-section");
    if (child.tagName === "SECTION" && sectionName && !["profile", "skills"].includes(sectionName)) {
      Array.from(child.children).forEach((sectionChild) => {
        if (
          sectionChild instanceof HTMLElement &&
          !sectionChild.classList.contains("page-break")
        ) {
          candidates.push(sectionChild);
        }
      });
      return;
    }

    candidates.push(child);
  });

  return candidates;
}

function findNextBreakCandidate(root: HTMLElement, style: ResumeDocumentStyle) {
  const page = RESUME_PAGE_SIZES[style.pageSize];
  const pageHeightPx = Math.round(page.heightIn * PX_PER_INCH);
  const topMarginPx = style.margins.top * PX_PER_INCH;
  const bottomMarginPx = style.margins.bottom * PX_PER_INCH;

  for (const candidate of collectBreakCandidates(root)) {
    const top = candidate.getBoundingClientRect().top - root.getBoundingClientRect().top;
    const bottom = getUnitBottom(candidate, root);
    const pageStart = Math.floor(top / pageHeightPx) * pageHeightPx;
    const printableBottom = pageStart + pageHeightPx - bottomMarginPx;

    if (bottom <= printableBottom) {
      continue;
    }

    const startsNearPageTop = top <= pageStart + topMarginPx + 12;
    if (!startsNearPageTop) {
      return candidate;
    }
  }

  return null;
}

function createMeasureSurface(
  html: string,
  style: ResumeDocumentStyle,
  editorRootClassName: string,
) {
  const wrapper = document.createElement("div");
  const editable = document.createElement("div");
  const cssVariables = getResumeStyleCssVariables(style);

  wrapper.className = editorRootClassName;
  Object.assign(wrapper.style, {
    left: "-100000px",
    position: "absolute",
    top: "0",
    visibility: "hidden",
    width: cssVariables["--resume-page-width"],
    zIndex: "-1",
  });

  Object.entries(cssVariables).forEach(([key, value]) => {
    wrapper.style.setProperty(key, value);
  });

  editable.className = "ck-editor__editable ck-content";
  editable.innerHTML = html;
  wrapper.append(editable);
  document.body.append(wrapper);

  return { wrapper, editable };
}

function collectTemplateBreakCandidates(page: HTMLElement) {
  return Array.from(page.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.classList.contains("page-break"),
  );
}

function getTemplateUnitBottom(element: HTMLElement, page: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const pageRect = page.getBoundingClientRect();
  return elementRect.bottom - pageRect.top;
}

function findTemplateOverflowCandidate(page: HTMLElement) {
  const candidates = collectTemplateBreakCandidates(page);

  for (const candidate of candidates) {
    const top = candidate.getBoundingClientRect().top - page.getBoundingClientRect().top;
    const bottom = getTemplateUnitBottom(candidate, page);

    if (bottom <= TEMPLATE_PAGE_HEIGHT_PX) {
      continue;
    }

    if (top > 24) {
      return candidate;
    }
  }

  return null;
}

function buildTemplatePageWithSidebar(
  basePage: HTMLElement,
  sidebar: HTMLElement,
  main: HTMLElement,
) {
  const nextPage = basePage.cloneNode(false) as HTMLElement;
  const nextSidebar = sidebar.cloneNode(true);
  const nextMain = main.cloneNode(false) as HTMLElement;

  nextPage.append(nextSidebar, nextMain);
  return { nextPage, nextMain };
}

function repaginateFlexTemplatePages(flow: HTMLElement, firstPage: HTMLElement) {
  const firstSidebar = firstPage.children[0];
  const firstMain = firstPage.children[1];

  if (!(firstSidebar instanceof HTMLElement) || !(firstMain instanceof HTMLElement)) {
    return false;
  }

  const mainContent = Array.from(flow.querySelectorAll<HTMLElement>(":scope > .rt-page"))
    .flatMap((page) => {
      const main = page.children[1];
      return main instanceof HTMLElement ? collectTemplateBreakCandidates(main) : [];
    });
  const basePage = firstPage.cloneNode(false) as HTMLElement;
  const { nextPage: firstNewPage, nextMain: firstNewMain } = buildTemplatePageWithSidebar(
    basePage,
    firstSidebar,
    firstMain,
  );

  flow.innerHTML = "";
  flow.append(firstNewPage);
  mainContent.forEach((node) => firstNewMain.append(node));

  for (let pass = 0; pass < 80; pass += 1) {
    const pages = Array.from(flow.querySelectorAll<HTMLElement>(":scope > .rt-page"));
    let moved = false;

    for (const page of pages) {
      const main = page.children[1];
      if (!(main instanceof HTMLElement)) continue;

      const candidate = findTemplateOverflowCandidate(main);
      if (!candidate) continue;

      const nextSibling = page.nextElementSibling;
      const nextMain =
        nextSibling instanceof HTMLElement &&
        nextSibling.classList.contains("rt-page") &&
        nextSibling.children[1] instanceof HTMLElement
          ? (nextSibling.children[1] as HTMLElement)
          : buildTemplatePageWithSidebar(basePage, firstSidebar, firstMain).nextMain;
      const nextPage = nextMain.parentElement;

      if (nextPage && !nextPage.parentElement) {
        page.after(nextPage);
      }

      let cursor: ChildNode | null = candidate;
      while (cursor) {
        const next: ChildNode | null = cursor.nextSibling;
        nextMain.append(cursor);
        cursor = next;
      }

      moved = true;
      break;
    }

    if (!moved) break;
  }

  return true;
}

function repaginateTemplatePages(editable: HTMLElement) {
  const flow = editable.querySelector<HTMLElement>(".rt-template-flow");
  const firstPage = flow?.querySelector<HTMLElement>(":scope > .rt-page");
  if (!flow || !firstPage) return false;

  if (getComputedStyle(firstPage).display === "flex" && firstPage.children.length >= 2) {
    return repaginateFlexTemplatePages(flow, firstPage);
  }

  const allContent = Array.from(flow.querySelectorAll<HTMLElement>(":scope > .rt-page"))
    .flatMap((page) => collectTemplateBreakCandidates(page));

  const basePage = firstPage.cloneNode(false) as HTMLElement;
  flow.innerHTML = "";
  flow.append(basePage);
  allContent.forEach((node) => basePage.append(node));

  for (let pass = 0; pass < 80; pass += 1) {
    const pages = Array.from(flow.querySelectorAll<HTMLElement>(":scope > .rt-page"));
    let moved = false;

    for (const page of pages) {
      const candidate = findTemplateOverflowCandidate(page);
      if (!candidate) {
        continue;
      }

      const nextPage =
        page.nextElementSibling instanceof HTMLElement &&
        page.nextElementSibling.classList.contains("rt-page")
          ? page.nextElementSibling
          : (page.cloneNode(false) as HTMLElement);

      if (!nextPage.parentElement) {
        page.after(nextPage);
      }

      let cursor: ChildNode | null = candidate;
      while (cursor) {
        const next: ChildNode | null = cursor.nextSibling;
        nextPage.append(cursor);
        cursor = next;
      }

      moved = true;
      break;
    }

    if (!moved) break;
  }

  return true;
}

export function buildAutoPaginatedEditorHtml(
  html: string,
  style: ResumeDocumentStyle,
  editorRootClassName: string,
) {
  const cleanHtml = stripPageBreaks(html);
  const { wrapper, editable } = createMeasureSurface(
    cleanHtml,
    style,
    editorRootClassName,
  );

  try {
    if (repaginateTemplatePages(editable)) {
      return editable.innerHTML;
    }

    for (let pass = 0; pass < 80; pass += 1) {
      const candidate = findNextBreakCandidate(editable, style);
      if (!candidate) break;

      const template = document.createElement("template");
      template.innerHTML = PAGE_BREAK_HTML;
      candidate.before(template.content.cloneNode(true));
      relayoutEditorPageBreaks(wrapper);
    }

    return editable.innerHTML;
  } finally {
    wrapper.remove();
  }
}

export function relayoutEditorPageBreaks(root: HTMLElement | null) {
  if (!root) return;

  const editable = root.querySelector<HTMLElement>(".ck-editor__editable");
  if (!editable) return;

  const editableRect = editable.getBoundingClientRect();
  const zoom = editable.offsetWidth ? editableRect.width / editable.offsetWidth : 1;
  const pageHeight = parseFloat(
    getComputedStyle(root).getPropertyValue("--resume-page-min-height"),
  );
  const paddingTop = parseFloat(getComputedStyle(editable).paddingTop);

  if (!Number.isFinite(pageHeight) || pageHeight <= 0) return;

  editable.querySelectorAll<HTMLElement>(".page-break").forEach((pageBreak) => {
    const breakTop = (pageBreak.getBoundingClientRect().top - editableRect.top) / zoom;
    const currentPageStart = Math.floor(breakTop / pageHeight) * pageHeight;
    const nextPageContentTop = currentPageStart + pageHeight + paddingTop;
    const spacerHeight = Math.max(
      MIN_PAGE_BREAK_SPACER_PX,
      nextPageContentTop - breakTop,
    );

    pageBreak.style.minHeight = `${Math.round(spacerHeight)}px`;
  });
}
