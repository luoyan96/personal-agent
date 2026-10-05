export class FileFetchError extends Error {
  constructor(message: string, public readonly retryable = false) { super(message); }
}
export const maxAgentFileBytes = 10 * 1024 * 1024;

/** A user-clicked SDK attachment only; never send cookies or follow redirects. */
export async function firstPartyFile({
  sourceUrl, filename, mediaType, expectedBytes, isCurrent,
}: {
  sourceUrl: string;
  filename: string;
  mediaType: string;
  expectedBytes: number;
  isCurrent: () => boolean;
}) {
  let url: URL;
  try { url = new URL(sourceUrl, location.origin); }
  catch { throw new FileFetchError("文件地址不可用，请从本机选择这个文件阅读。"); }
  const configured = new URL(import.meta.env.VITE_RESEARCH_FILE_ORIGIN || "https://files.chat.acceptcat.com");
  const configuredOrigin = configured.username || configured.password || configured.pathname !== "/" || configured.search || configured.hash
    ? undefined : configured.origin;
  if (url.username || url.password || !["https:", "http:"].includes(url.protocol) ||
      ![location.origin, configuredOrigin].includes(url.origin))
    throw new FileFetchError("只读取本站或已配置文件服务中的附件，不读取其他网址或带身份信息的地址。");
  if (expectedBytes > maxAgentFileBytes)
    throw new FileFetchError("文件超过 10 MiB，请拆分或减小文件后重新发送。");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const watchScope = setInterval(() => { if (!isCurrent()) controller.abort(); }, 50);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (!isCurrent()) throw new DOMException("File operation cancelled", "AbortError");
    const response = await fetch(url.href, { credentials: "omit", redirect: "error", signal: controller.signal });
    if (!response.ok) throw new FileFetchError("文件无法取回，地址可能已过期；可重试或从本机选择这个文件阅读。", true);
    if (Number(response.headers.get("content-length")) > maxAgentFileBytes)
      throw new FileFetchError("文件超过 10 MiB，请拆分或减小文件后重新发送。");
    reader = response.body?.getReader();
    if (!reader) throw new FileFetchError("浏览器无法流式读取文件，请从本机选择这个文件阅读。");
    const chunks: ArrayBuffer[] = [];
    let byteLength = 0;
    while (true) {
      if (!isCurrent()) throw new DOMException("File operation cancelled", "AbortError");
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maxAgentFileBytes)
        throw new FileFetchError("文件超过 10 MiB，请拆分或减小文件后重新发送。");
      chunks.push(next.value.slice().buffer as ArrayBuffer);
    }
    if (expectedBytes > 0 && byteLength !== expectedBytes)
      throw new FileFetchError("取回文件大小与原附件不同，请从本机选择原文件阅读。");
    return new File(chunks, filename, { type: mediaType });
  } catch (error) {
    if (error instanceof FileFetchError) throw error;
    throw new FileFetchError("文件取回失败或需要跳转，请重试或从本机选择这个文件阅读。", true);
  } finally {
    clearTimeout(timeout); clearInterval(watchScope);
    controller.abort();
    await reader?.cancel().catch(() => {});
  }
}
