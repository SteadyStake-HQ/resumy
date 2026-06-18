"use client";

import type { ComponentType } from "react";

export type EditorHandle = {
  getData: () => string;
  setData?: (data: string) => void;
};

export type CKEditorComponent = ComponentType<{
  editor: unknown;
  data: string;
  disabled?: boolean;
  config?: Record<string, unknown>;
  onReady?: (editor: EditorHandle) => void;
  onChange?: (event: unknown, editor: EditorHandle) => void;
}>;

export type LoadedCKEditor = {
  Component: CKEditorComponent;
  ClassicEditor: unknown;
  plugins: unknown[];
};

let ckeditorPromise: Promise<LoadedCKEditor> | null = null;

export function loadCKEditor() {
  ckeditorPromise ??= Promise.all([
    import("@ckeditor/ckeditor5-react"),
    import("ckeditor5"),
  ]).then(([reactModule, ckeditorModule]) => ({
    Component: reactModule.CKEditor as CKEditorComponent,
    ClassicEditor: ckeditorModule.ClassicEditor,
    plugins: [
      ckeditorModule.Essentials,
      ckeditorModule.Paragraph,
      ckeditorModule.Heading,
      ckeditorModule.Bold,
      ckeditorModule.Italic,
      ckeditorModule.List,
      ckeditorModule.Font,
      ckeditorModule.Alignment,
      ckeditorModule.Indent,
      ckeditorModule.Link,
      ckeditorModule.FindAndReplace,
      ckeditorModule.GeneralHtmlSupport,
      ckeditorModule.RemoveFormat,
      ckeditorModule.PageBreak,
      ckeditorModule.SelectAll,
    ].filter(Boolean),
  }));

  return ckeditorPromise;
}
