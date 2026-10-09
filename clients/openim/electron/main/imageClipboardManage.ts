import { clipboard, ipcMain, nativeImage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { authority } from "./localFolderManage";
import { clipboardSequence, readClipboardFilePaths } from "../utils/clipboardFiles";
import { runWindowsOcr } from "../utils/windowsOcr";
import {
  validateImageSize,
  imageTileOffsets,
  mergeOcrLines,
} from "../utils/imageOcrLayout";
import type { ClipboardImages } from "../../src/types/imageClipboard";
import { imagePasteLimits } from "../utils/imagePasteLimits";

export function imageTiles(image: Electron.NativeImage) {
  const size = image.getSize();
  validateImageSize(size.width, size.height);
  const resized =
    size.width > 2200 ? image.resize({ width: 2200, quality: "best" }) : image;
  const { width, height } = resized.getSize(),
    tiles: { top: number; png: string }[] = [];
  for (const top of imageTileOffsets(height)) {
    tiles.push({
      top,
      png: resized
        .crop({ x: 0, y: top, width, height: Math.min(2200, height - top) })
        .toPNG()
        .toString("base64"),
    });
  }
  return tiles;
}
export function registerImageClipboardBridge() {
  let running: { id: string; owner: string; controller: AbortController } | undefined;
  ipcMain.handle("read-chat-clipboard-images", async (event) => {
    const auth = authority(event),
      copied = readClipboardFilePaths();
    const images: ClipboardImages["images"] = [];
    let total = 0,
      skipped = 0;
    if (copied.paths.length) {
      for (const filePath of copied.paths) {
        if (!/\.(png|jpe?g|bmp|webp|gif)$/i.test(filePath)) {
          skipped++;
          continue;
        }
        const handle = await fs.open(filePath, "r");
        try {
          const info = await handle.stat();
          if (!info.isFile() || info.size > imagePasteLimits.bytes)
            throw new Error("每张图片不能超过 10 MB。");
          total += info.size;
          if (total > imagePasteLimits.totalBytes)
            throw new Error("一次图片总大小不能超过 50 MB。");
          const bytes = Buffer.alloc(info.size + 1);
          const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
          if (bytesRead !== info.size || (await handle.stat()).size !== info.size)
            throw new Error("图片在读取期间发生变化，请重新复制。");
          images.push({
            name: path.basename(filePath),
            bytes: bytes.subarray(0, bytesRead),
          });
        } finally {
          await handle.close();
        }
      }
    } else {
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        const size = image.getSize();
        validateImageSize(size.width, size.height);
        const bytes = image.toPNG();
        if (bytes.length > imagePasteLimits.bytes)
          throw new Error("剪贴板图片超过 10 MB，请缩小后重试。");
        images.push({ name: "粘贴图片.png", bytes });
      }
    }
    if (
      authority(event).owner !== auth.owner ||
      clipboardSequence() !== copied.sequence
    )
      throw new Error("复制内容或会话已变化，请重新粘贴。");
    return {
      images,
      notice: skipped
        ? `已忽略 ${skipped} 个非图片文件。`
        : !images.length
        ? "剪贴板里没有可读取的图片。微信多选若只复制了消息记录，请先保存图片，再多选图片文件粘贴或拖入。"
        : undefined,
    } satisfies ClipboardImages;
  });
  ipcMain.handle(
    "recognize-chat-image",
    async (event, request: { id: string; bytes: Uint8Array }) => {
      const auth = authority(event);
      if (
        !request ||
        typeof request.id !== "string" ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(request.id) ||
        !(request.bytes instanceof Uint8Array) ||
        request.bytes.length > imagePasteLimits.bytes ||
        !request.bytes.length
      )
        throw new Error("图片识别请求无效。");
      if (running) throw new Error("还有图片正在识别，请等待或取消后再试。");
      const controller = new AbortController(),
        active = { id: request.id, owner: auth.owner, controller };
      running = active;
      const cancel = () => controller.abort();
      const navigate = (
        _e: unknown,
        _url: string,
        _inPlace: boolean,
        mainFrame: boolean,
      ) => {
        if (mainFrame) cancel();
      };
      auth.contents.on("did-start-navigation", navigate);
      auth.contents.once("destroyed", cancel);
      try {
        const tiles = imageTiles(
          nativeImage.createFromBuffer(Buffer.from(request.bytes)),
        );
        const result = await runWindowsOcr(
          tiles.map((tile) => tile.png),
          controller.signal,
        );
        if (authority(event).owner !== auth.owner || controller.signal.aborted)
          throw new Error("识别已取消。请在当前会话重新识别。");
        const text = mergeOcrLines(
          result.results,
          tiles.map((tile) => tile.top),
        );
        if (text.length > 100000) throw new Error("识别文字过多，请分批处理。");
        return {
          text,
          paragraphText: mergeOcrLines(
            result.results,
            tiles.map((tile) => tile.top),
            true,
          ),
          language: result.language,
          tiles: tiles.length,
        };
      } finally {
        controller.abort();
        auth.contents.removeListener("did-start-navigation", navigate);
        auth.contents.removeListener("destroyed", cancel);
        if (running === active) running = undefined;
      }
    },
  );
  ipcMain.handle("cancel-chat-image-ocr", (event, id: string) => {
    const auth = authority(event);
    if (running?.owner === auth.owner && running.id === id) running.controller.abort();
  });
}
