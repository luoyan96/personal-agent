// UI selection limits; the main process enforces its own imagePasteLimits.
export const imagePasteLimits = {
  count: 20,
  bytes: 10 * 1024 * 1024,
  totalBytes: 50 * 1024 * 1024,
};
export type ClipboardImage = { name: string; bytes: Uint8Array };
export type ClipboardImages = { images: ClipboardImage[]; notice?: string };
export type ImageOcrResult = {
  text: string;
  paragraphText?: string;
  language: string;
  tiles: number;
};
