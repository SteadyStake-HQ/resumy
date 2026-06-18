declare module "html-to-docx" {
  type DocumentOptions = Record<string, unknown>;

  export default function htmlToDocx(
    html: string,
    headerHtml?: string | null,
    options?: DocumentOptions,
    footerHtml?: string | null,
  ): Promise<Buffer | ArrayBuffer>;
}
