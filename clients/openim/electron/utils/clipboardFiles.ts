import koffi from "koffi";

let api: ReturnType<typeof loadApi> | undefined;
function loadApi() {
  const user = koffi.load("user32.dll"),
    shell = koffi.load("shell32.dll");
  return {
    open: user.func("bool __stdcall OpenClipboard(void *owner)"),
    close: user.func("bool __stdcall CloseClipboard()"),
    get: user.func("void * __stdcall GetClipboardData(uint format)"),
    sequence: user.func("uint __stdcall GetClipboardSequenceNumber()"),
    query: shell.func(
      "uint __stdcall DragQueryFileW(void *drop, uint index, void *buffer, uint length)",
    ),
  };
}
export function pathsFromDrop(
  drop: unknown,
  query: (handle: any, index: number, buffer: Buffer | null, length: number) => number,
) {
  const count = query(drop, 0xffffffff, null, 0);
  if (count > 20) throw new Error("每次最多粘贴 20 张图片，请分批复制。");
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const size = query(drop, i, null, 0);
    if (!size || size > 32767) throw new Error("图片路径无法读取。");
    const buffer = Buffer.alloc((size + 1) * 2);
    query(drop, i, buffer, size + 1);
    paths.push(buffer.toString("utf16le", 0, size * 2));
  }
  return paths;
}
/** CF_HDROP comes only from the clipboard. No renderer-supplied local paths. */
export function readClipboardFilePaths(): { paths: string[]; sequence: number } {
  if (process.platform !== "win32") return { paths: [], sequence: 0 };
  const win = (api ??= loadApi());
  if (!win.open(null)) throw new Error("剪贴板正在被其他程序使用，请重新复制后粘贴。");
  try {
    const sequence = win.sequence(),
      drop = win.get(15);
    if (!drop) return { paths: [], sequence };
    return { paths: pathsFromDrop(drop, win.query), sequence };
  } finally {
    win.close();
  }
}
export function clipboardSequence() {
  return process.platform === "win32" ? (api ??= loadApi()).sequence() : 0;
}
