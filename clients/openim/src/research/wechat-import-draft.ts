import { isComposerImage, normalizeComposerImage } from "./composer-files";
import { assertImageQueueCapacity, type ComposerImage } from "./chat-image-submission";
import { imagePasteLimits } from "../types/imageClipboard";

/** Validate every part before the host mutates either the editor or its attachment trays. */
export function prepareImportedComposerDraft(input: {
  text: string;
  files: File[];
  html: string;
  plainText: string;
  documents: File[];
  images: ComposerImage[];
  queued: Parameters<typeof assertImageQueueCapacity>[1];
}) {
  if (input.plainText.length + input.text.length + 2 > 8000)
    throw Error("加入后正文超过 8000 字，请选择将聊天原文作为 TXT 附件加入。");
  const images = input.files.filter(isComposerImage).map(normalizeComposerImage);
  const documents = input.files.filter((file) => !isComposerImage(file));
  if (
    input.files.some((file) => !file.size) ||
    input.documents.length + documents.length > 20
  )
    throw Error("待发文件超过 20 个或包含空文件，请减少选择后重试。");
  if (
    input.images.length + images.length > imagePasteLimits.count ||
    images.some((file) => file.size > imagePasteLimits.bytes) ||
    input.images.reduce((sum, item) => sum + item.size, 0) +
      images.reduce((sum, file) => sum + file.size, 0) >
      imagePasteLimits.totalBytes
  )
    throw Error(
      "图片超出待发范围，每张最多 10 MiB、合计 50 MiB、最多 20 张，请减少选择。",
    );
  assertImageQueueCapacity(
    [
      ...input.images,
      ...images.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        mediaType: file.type,
      })),
    ],
    input.queued,
  );
  const escaped = input.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
  return input.text
    ? `${input.html}${input.html ? "<p><br></p>" : ""}<p>${escaped}</p>`
    : input.html;
}
