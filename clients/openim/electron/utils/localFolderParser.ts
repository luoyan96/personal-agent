import { inflateRawSync } from "node:zlib";
import { createRequire } from "node:module";
import type { LocalFolderFileKind } from "../../src/types/localFolder";
import { localFolderFail } from "./localFolder";

export async function parseLocalDocument(
  bytes: Uint8Array,
  kind: LocalFolderFileKind,
): Promise<{ text: string; pageCount?: number }> {
  if (bytes.byteLength > 10485760) localFolderFail("LOCAL_FOLDER_TOO_LARGE");
  if (kind === "docx") {
    // Existing ZIP library is used only to locate this bounded entry. Inflate
    // with Node's hard output cap; never resolve external OOXML relationships.
    const AdmZip = require("adm-zip");
    let zip, entry;
    try {
      zip = new AdmZip(Buffer.from(bytes));
      const entries = zip.getEntries();
      if (entries.length > 500) localFolderFail("LOCAL_FOLDER_TOO_LARGE");
      entry = zip.getEntry("word/document.xml");
      if (
        !entry ||
        entry.header.size > 2097152 ||
        entry.header.compressedSize > 10485760
      )
        localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("LOCAL_FOLDER_"))
        throw error;
      localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
    }
    let xml: string;
    try {
      const compressed = entry.getCompressedData(),
        data =
          entry.header.method === 0
            ? compressed
            : entry.header.method === 8
            ? inflateRawSync(compressed, { maxOutputLength: 2097152 })
            : null;
      if (!data || data.length !== entry.header.size)
        localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
      xml = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
    }
    if (
      /<!DOCTYPE|<!ENTITY/i.test(xml) ||
      !/<w:document\b/.test(xml) ||
      !/<\/w:document>/.test(xml)
    )
      localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
    const decode = (value: string) =>
      value.replace(/&([^;]+);/g, (_all, entity: string) => {
        const names: Record<string, string> = {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
        };
        if (names[entity]) return names[entity];
        const match = /^#(x[\da-f]+|\d+)$/i.exec(entity);
        if (!match) localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
        const code =
          match[1]![0]!.toLowerCase() === "x"
            ? parseInt(match[1]!.slice(1), 16)
            : Number(match[1]);
        if (
          !Number.isInteger(code) ||
          code < 1 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        )
          localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
        return String.fromCodePoint(code);
      });
    let text = "";
    for (const match of xml.matchAll(
      /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<\/w:p>/g,
    )) {
      text +=
        match[1] !== undefined
          ? decode(match[1])
          : match[0].startsWith("<w:tab")
          ? "\t"
          : "\n";
      if (text.length > 200000 || Buffer.byteLength(JSON.stringify(text), "utf8") > 512000)
        localFolderFail("LOCAL_FOLDER_TOO_LARGE");
    }
    if (!text.trim()) localFolderFail("LOCAL_FOLDER_NO_TEXT");
    return { text };
  }
  if (kind !== "pdf") localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
  // Electron 22 utility processes run Node16 but PDF.js identifies them as a
  // browser without a DOM. Use its official legacy build and a preloaded local
  // worker handler, so neither a browser Worker nor a script URL is needed.
  const legacyUtility = Boolean(
    process.versions.electron && process.type === "utility",
  );
  const pdfjs = legacyUtility
    ? require("pdfjs-dist/legacy/build/pdf.js")
    : require("pdfjs-dist/build/pdf.js");
  const pdfGlobal = globalThis as typeof globalThis & { pdfjsWorker?: unknown };
  if (typeof pdfGlobal.ReadableStream !== "function") {
    const pdfRequire = createRequire(require.resolve("pdfjs-dist/package.json"));
    pdfGlobal.ReadableStream = pdfRequire(
      "web-streams-polyfill/dist/ponyfill.js",
    ).ReadableStream;
  }
  pdfGlobal.pdfjsWorker = legacyUtility
    ? require("pdfjs-dist/legacy/build/pdf.worker.js")
    : require("pdfjs-dist/build/pdf.worker.js");
  let loading: any, document: any;
  try {
    // Byte-only, no eval, no image rendering, no external assets or JS actions.
    loading = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false,
      disableAutoFetch: true,
      disableStream: true,
      stopAtErrors: true,
      verbosity: 0,
    });
    document = await loading.promise;
    if (document.numPages > 200) localFolderFail("LOCAL_FOLDER_TOO_LARGE");
    let text = "";
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber),
        content = await page.getTextContent(),
        body = content.items
          .map((item: { str?: string; hasEOL?: boolean }) =>
            typeof item.str === "string" ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("");
      if (body.trim()) text += `### 第${pageNumber}页提取文字\n\n${body}\n\n`;
      if (text.length > 200000 || Buffer.byteLength(JSON.stringify(text), "utf8") > 512000)
        localFolderFail("LOCAL_FOLDER_TOO_LARGE");
      await page.cleanup();
    }
    if (!text.trim()) localFolderFail("LOCAL_FOLDER_NO_TEXT");
    return { text, pageCount: document.numPages };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("LOCAL_FOLDER_"))
      throw error;
    if ((error as { name?: string })?.name === "PasswordException")
      localFolderFail("LOCAL_FOLDER_ENCRYPTED");
    localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
  } finally {
    try {
      if (document) await document.destroy();
      else if (loading) await loading.destroy();
    } catch {
      /* process is also bounded by its parent */
    }
  }
}

// This entry runs in an isolated Electron utility process (Node16). Node test
// imports have no parentPort, so importing the actual parser is side-effect-free.
const port = (
  process as typeof process & {
    parentPort?: {
      once: (event: string, callback: (event: { data: any }) => void) => void;
      postMessage: (message: unknown) => void;
    };
  }
).parentPort;
if (port)
  port.once("message", async (event) => {
    try {
      const data = event.data;
      if (
        !data ||
        !(data.bytes instanceof Uint8Array) ||
        !["pdf", "docx"].includes(data.kind)
      )
        localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
      port.postMessage({
        ok: true,
        ...(await parseLocalDocument(data.bytes, data.kind)),
      });
    } catch (error) {
      const code =
        error instanceof Error
          ? /^LOCAL_FOLDER_[A-Z_]+/.exec(error.message)?.[0]
          : undefined;
      port.postMessage({ ok: false, code: code ?? "LOCAL_FOLDER_PARSE_FAILED" });
    }
  });
