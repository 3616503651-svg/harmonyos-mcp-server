declare module "pdf-parse" {
  function pdfParse(buffer: Buffer): Promise<{ text: string }>;
  export default pdfParse;
}

declare module "mammoth" {
  export function extractRawText(options: { buffer: Buffer }): Promise<{ value: string }>;
}
