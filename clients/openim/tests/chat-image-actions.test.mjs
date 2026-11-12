import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

async function load(file, imports = {}, globals = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      source.replace(/import\.meta\.env\.VITE_RESEARCH_FILE_ORIGIN/g, "undefined"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      Buffer,
      Uint8Array,
      File,
      Blob,
      URL,
      console,
      Error,
      require: (name) => {
        if (!(name in imports)) throw Error("Unexpected import: " + name);
        return imports[name];
      },
      ...globals,
    },
    { filename: file },
  );
  return module.exports;
}
const format = await load("../electron/utils/chatImageFormat.js");
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
const webp = Uint8Array.from(Buffer.from("RIFF1234WEBPoriginal-bytes"));
const limits = { imagePasteLimits: { bytes: 10 * 1024 * 1024 } };

test("file signatures determine PNG/JPEG/GIF/WebP/BMP format, ignoring misleading names and MIME", () => {
  for (const [bytes, expected] of [
    [png, "png"],
    [new Uint8Array([255, 216, 255, 9]), "jpg"],
    [Buffer.from("GIF89a123"), "gif"],
    [webp, "webp"],
    [Buffer.from("BM123"), "bmp"],
  ])
    assert.equal(format.chatImageFormat(bytes).extension, expected);
  for (const value of [
    new Uint8Array(),
    Buffer.from("<html>error</html>"),
    Buffer.from("<svg>"),
    Buffer.from("RIFFnot-image"),
  ])
    assert.throws(() => format.chatImageFormat(value), /不是支持/);
});
test("default filenames cannot escape directories, use device names or lie about original format", () => {
  assert.equal(format.chatImageFilename("../../论文截图.jpg", "webp"), "论文截图.webp");
  assert.equal(format.chatImageFilename("C:\\folder\\CON.png", "png"), "图片.png");
  assert.equal(format.chatImageFilename("截图?.jpg", "png"), "截图_.png");
});

async function imageReader(overrides = {}, globals = {}) {
  return load(
    "../src/research/chat-image-actions.ts",
    {
      "../../electron/utils/chatImageFormat": format,
      "@/types/imageClipboard": limits,
      "./firstPartyFile": {
        firstPartyFile: async () => {
          throw Error("unexpected fetch");
        },
        ...overrides,
      },
    },
    globals,
  );
}
test("local draft actions use its bytes without uploading, fetching or trusting its extension", async () => {
  const code = await imageReader();
  const file = await code.readChatImage(
    { file: new File([webp], "图.jpg", { type: "image/jpeg" }) },
    () => true,
  );
  assert.equal(file.name, "图.webp");
  assert.equal(file.type, "image/webp");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), webp);
});
test("remote actions request the original URL and exact size through the bounded attachment reader", async () => {
  let request;
  const code = await imageReader({
    firstPartyFile: async (value) => {
      request = value;
      return new File([png], value.filename);
    },
  });
  const current = () => true;
  await code.readChatImage(
    {
      url: "https://files.chat.acceptcat.com/original",
      filename: "截图.jpg",
      expectedBytes: png.length,
    },
    current,
  );
  assert.equal(request.sourceUrl, "https://files.chat.acceptcat.com/original");
  assert.equal(request.expectedBytes, png.length);
  assert.equal(request.isCurrent, current);
});
test("missing originals, non-images, empty/oversized files and stale conversations cannot proceed", async () => {
  const code = await imageReader();
  await assert.rejects(
    code.readChatImage({ url: "", expectedBytes: 0, filename: "图.png" }, () => true),
    /原图/,
  );
  for (const file of [
    new File([], "empty.png"),
    new File([new Uint8Array(limits.imagePasteLimits.bytes + 1)], "big.png"),
    new File(["<html>expired</html>"], "image.png"),
  ])
    await assert.rejects(code.readChatImage({ file }, () => true));
  await assert.rejects(
    code.readChatImage({ file: new File([png], "图.png") }, () => false),
    /会话/,
  );
  let current = true;
  const slow = {
    size: png.length,
    name: "图.png",
    arrayBuffer: async () => {
      current = false;
      return png.buffer;
    },
  };
  await assert.rejects(
    code.readChatImage({ file: slow }, () => current),
    /会话/,
  );
});
test("original-image transport rejects foreign origins and redirects, omits credentials, and checks real byte counts", async () => {
  const requests = [];
  let response = () => new Response(png);
  const code = await load(
    "../src/research/firstPartyFile.ts",
    {},
    {
      location: { origin: "http://127.0.0.1:4317" },
      AbortController,
      DOMException,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      fetch: async (url, options) => {
        requests.push({ url, options });
        return response();
      },
    },
  );
  const request = {
    filename: "图.png",
    mediaType: "image/png",
    expectedBytes: png.length,
    isCurrent: () => true,
  };
  for (const url of [
    "https://foreign.test/image.png",
    "file:///C:/private.png",
    "https://user:secret@files.chat.acceptcat.com/image.png",
  ])
    await assert.rejects(code.firstPartyFile({ ...request, sourceUrl: url }), /不读取/);
  assert.equal(requests.length, 0);
  const file = await code.firstPartyFile({
    ...request,
    sourceUrl: "https://files.chat.acceptcat.com/original",
  });
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), png);
  assert.equal(requests[0].options.credentials, "omit");
  assert.equal(requests[0].options.redirect, "error");
  await assert.rejects(
    code.firstPartyFile({
      ...request,
      expectedBytes: 1,
      sourceUrl: "https://files.chat.acceptcat.com/original",
    }),
    /大小/,
  );
  response = () => {
    throw new TypeError("redirect denied");
  };
  await assert.rejects(
    code.firstPartyFile({
      ...request,
      sourceUrl: "https://files.chat.acceptcat.com/original",
    }),
    /跳转/,
  );
});
test("copy conversion draws full original pixels to PNG and closes its decoded bitmap", async () => {
  const calls = [];
  const code = await imageReader(
    {},
    {
      createImageBitmap: async () => ({
        width: 120,
        height: 300,
        close: () => calls.push("close"),
      }),
      document: {
        createElement: () => ({
          getContext: () => ({ drawImage: (_image, x, y) => calls.push([x, y]) }),
          toBlob: (callback, mime) => {
            calls.push(mime);
            callback(new Blob([png], { type: mime }));
          },
        }),
      },
    },
  );
  const blob = await code.chatImagePng(new File([webp], "图.webp"));
  assert.equal(blob.type, "image/png");
  assert.deepEqual(calls, [[0, 0], "image/png", "close"]);
});
test("oversized decoded dimensions fail before canvas allocation and still release the bitmap", async () => {
  let closed = 0;
  const code = await imageReader(
    {},
    {
      createImageBitmap: async () => ({
        width: 10000,
        height: 10000,
        close: () => closed++,
      }),
    },
  );
  await assert.rejects(code.chatImagePng(new File([png], "图.png")), /尺寸/);
  assert.equal(closed, 1);
});

async function nativeBridge() {
  const handlers = {},
    writes = [],
    copies = [],
    dialogs = [];
  let owner = "current-window",
    dialogResult = { canceled: true },
    blocked = false,
    empty = false;
  const code = await load("../electron/main/chatImageActionsManage.ts", {
    electron: {
      ipcMain: {
        handle: (name, handler) => {
          handlers[name] = handler;
        },
      },
      BrowserWindow: { fromWebContents: () => ({}) },
      clipboard: { writeImage: (image) => copies.push(image) },
      nativeImage: {
        createFromBuffer: (bytes) => ({
          bytes,
          isEmpty: () => empty,
          getSize: () => ({ width: 1, height: 1 }),
        }),
      },
      dialog: {
        showSaveDialog: async (_parent, options) => {
          dialogs.push(options);
          return typeof dialogResult === "function" ? dialogResult() : dialogResult;
        },
      },
    },
    "node:fs": {
      promises: {
        writeFile: async (...args) => {
          writes.push(args);
        },
      },
    },
    "node:path": path,
    "../utils/chatImageFormat": format,
    "./localFolderManage": {
      authority: () => {
        if (blocked) throw Error("forbidden");
        return { owner, contents: {} };
      },
    },
    "../utils/imagePasteLimits": limits,
    "../utils/imageOcrLayout": {
      validateImageSize: (w, h) => {
        assert.equal(w * h, 1);
      },
    },
  });
  code.registerChatImageActionsBridge();
  return {
    handlers,
    writes,
    copies,
    dialogs,
    owner: (value) => {
      owner = value;
    },
    blocked: () => {
      blocked = true;
    },
    empty: () => {
      empty = true;
    },
    dialog: (value) => {
      dialogResult = value;
    },
  };
}
test("native clipboard receives decoded image pixels, never a URL or placeholder string", async () => {
  const f = await nativeBridge();
  f.handlers["copy-chat-image"]({}, png);
  assert.equal(f.copies.length, 1);
  assert.deepEqual(f.copies[0].bytes, Buffer.from(png));
  for (const input of [
    "[图片]",
    "https://example.com/image.png",
    webp,
    new Uint8Array(),
    new Uint8Array(limits.imagePasteLimits.bytes + 1),
  ])
    assert.throws(() => f.handlers["copy-chat-image"]({}, input));
  f.empty();
  assert.throws(() => f.handlers["copy-chat-image"]({}, png), /无法读取/);
  assert.equal(f.copies.length, 1);
});
test("save-as opens the native dialog and preserves original animated-format bytes exactly", async () => {
  const f = await nativeBridge();
  f.dialog({ canceled: false, filePath: "D:\\chosen\\图.webp" });
  assert.equal(await f.handlers["save-chat-image"]({}, "../../图.jpg", webp), true);
  assert.equal(f.dialogs[0].defaultPath, "图.webp");
  assert.equal(f.writes[0][0], "D:\\chosen\\图.webp");
  assert.deepEqual(f.writes[0][1], Buffer.from(webp));
});
test("canceling save writes nothing; a changed window or changed extension also blocks writing", async () => {
  const f = await nativeBridge();
  assert.equal(await f.handlers["save-chat-image"]({}, "图.png", png), false);
  f.dialog({ canceled: false, filePath: "D:\\chosen\\wrong.jpg" });
  await assert.rejects(f.handlers["save-chat-image"]({}, "图.png", png), /后缀/);
  f.dialog(() => {
    f.owner("other-window");
    return { canceled: false, filePath: "D:\\chosen\\图.png" };
  });
  await assert.rejects(f.handlers["save-chat-image"]({}, "图.png", png), /窗口/);
  assert.equal(f.writes.length, 0);
});
test("native actions authorize before touching clipboard, opening dialogs or writing paths", async () => {
  const f = await nativeBridge();
  f.blocked();
  assert.throws(() => f.handlers["copy-chat-image"]({}, png), /forbidden/);
  await assert.rejects(f.handlers["save-chat-image"]({}, "图.png", png), /forbidden/);
  assert.equal(f.copies.length + f.dialogs.length + f.writes.length, 0);
});
test("preload exposes narrow image byte methods wired to their actual native handlers", async () => {
  const f = await nativeBridge();
  let exposed;
  await load(
    "../electron/preload/index.ts",
    {
      fs: {},
      path,
      electron: {
        contextBridge: {
          exposeInMainWorld: (_name, api) => {
            exposed = api;
          },
        },
        ipcRenderer: { invoke: (name, ...args) => f.handlers[name]({}, ...args) },
      },
      "@openim/electron-client-sdk/lib/preload": {},
      "./wechatImportClient": { createWeChatImportClient: () => ({}) },
      "../utils/imagePasteLimits": limits,
    },
    { process },
  );
  await exposed.copyChatImage(png);
  assert.equal(f.copies.length, 1);
  assert.equal(await exposed.saveChatImage("图.png", png), false);
  assert.equal(f.writes.length, 0);
});

function hooks() {
  const slots = [];
  let index = 0;
  return {
    begin: () => {
      index = 0;
    },
    react: {
      memo: (value) => value,
      useState: (initial) => {
        const i = index++;
        if (!(i in slots)) slots[i] = initial;
        return [
          slots[i],
          (value) => {
            slots[i] = value;
          },
        ];
      },
      useRef: (initial) => {
        const i = index++;
        if (!(i in slots)) slots[i] = { current: initial };
        return slots[i];
      },
      useEffect: () => {},
    },
  };
}
const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "fragment" };
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function imageComponent() {
  const h = hooks(),
    calls = [],
    toasts = [],
    api = {
      copyChatImage: async (bytes) => calls.push(["copy", bytes]),
      saveChatImage: async (name, bytes) => {
        calls.push(["save", name, bytes]);
        return false;
      },
      recognizeChatImage: async () => {
        calls.push(["ocr"]);
        return { text: "识别出来的科研文字" };
      },
      cancelChatImageOcr: async () => {},
    };
  let current = true;
  const code = await load(
    "../src/research/ChatImage.tsx",
    {
      react: h.react,
      "react/jsx-runtime": jsxRuntime,
      antd: {
        Button: "button",
        Dropdown: "dropdown",
        Image: "image",
        Input: { TextArea: "textarea" },
        Modal: "modal",
        Space: "space",
      },
      "@ant-design/icons": { CopyOutlined: "copy-icon", DownloadOutlined: "save-icon" },
      "@/store": {
        useConversationStore: (selector) =>
          selector({ currentConversation: { conversationID: "chat" } }),
      },
      "./store": { useResearchStore: (selector) => selector({ generation: 1 }) },
      "@/utils/common": { feedbackToast: (value) => toasts.push(value) },
      "./useAgentChatOperation": {
        useAgentChatOperation: () => () => ({
          signal: new AbortController().signal,
          isCurrent: () => current,
          dispose() {},
        }),
      },
      "./chat-image-actions": {
        readChatImage: async (source) => {
          calls.push(["read", source]);
          return new File([png], "原图.png");
        },
        chatImagePng: async () => new Blob([png], { type: "image/png" }),
      },
    },
    {
      window: { electronAPI: api },
      navigator: {
        clipboard: { writeText: async (value) => calls.push(["text", value]) },
      },
      crypto,
      setTimeout,
    },
  );
  const props = {
    src: "thumbnail",
    originalUrl: "original",
    source: { url: "original", expectedBytes: png.length, filename: "image.png" },
    onReply: () => calls.push(["reply"]),
  };
  const render = () => {
    h.begin();
    return code.default(props);
  };
  const action = async (key) => {
    render().props.children[0].props.menu.onClick({ key });
    await flush();
    await flush();
  };
  return {
    render,
    action,
    props,
    calls,
    toasts,
    api,
    stale: () => {
      current = false;
    },
  };
}
test("image bubble and portal preview share image copy/save/OCR menus and stop the inherited text menu", async () => {
  const f = await imageComponent();
  const bubble = f.render().props.children[0];
  const image = bubble.props.children.props.children;
  const preview = image.props.preview.imageRender(jsx("img", {}));
  for (const menu of [bubble, preview]) {
    assert.deepEqual(Array.from(menu.props.menu.items, (i) => i.key).filter(Boolean), [
      "copy",
      "reply",
      "save",
      "ocr",
    ]);
    let stopped = false;
    menu.props.children.props.onContextMenu({
      stopPropagation: () => {
        stopped = true;
      },
    });
    assert.equal(stopped, true);
    assert.equal(
      menu.props.menu.items.some((i) => i.label === "复制文字"),
      false,
    );
  }
  await f.action("copy");
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ["read", "copy"],
  );
  assert.deepEqual(f.calls[1][1], png);
  assert.equal(f.toasts[0].msg, "图片已复制");
});
test("renderer save cancel produces no success toast; local OCR opens selectable text without sending a message", async () => {
  const f = await imageComponent();
  await f.action("save");
  assert.equal(f.toasts.length, 0);
  assert.deepEqual(f.calls[1].slice(0, 2), ["save", "原图.png"]);
  await f.action("ocr");
  const modal = f.render().props.children[1];
  assert.equal(modal.props.open, true);
  assert.equal(modal.props.children.props.value, "识别出来的科研文字");
  assert.equal(modal.props.children.props.readOnly, true);
  assert.equal(
    f.calls.some((c) => c[0] === "reply" || c[0] === "text"),
    false,
  );
});
test("native failures are visible, unavailable OCR is omitted, and stale downloads do not copy into another session", async () => {
  const f = await imageComponent();
  f.api.copyChatImage = async () => {
    throw Error("clipboard busy");
  };
  await f.action("copy");
  assert.equal(f.toasts[0].msg, "clipboard busy");
  delete f.api.recognizeChatImage;
  assert.equal(
    f.render().props.children[0].props.menu.items.some((i) => i.key === "ocr"),
    false,
  );
  f.calls.length = 0;
  f.stale();
  await f.action("copy");
  assert.equal(
    f.calls.some((c) => c[0] === "copy"),
    false,
  );
});

const selection = await load("../src/research/chat-message-copy.ts");
test("text selection must belong wholly to the clicked message, including both range endpoints", () => {
  const root = { contains: (node) => node === "inside" };
  const value = (start = "inside", end = "inside") => ({
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({ startContainer: start, endContainer: end }),
    toString: () => "这句选中文字",
  });
  assert.equal(selection.selectedMessageText(root, value()), "这句选中文字");
  for (const other of [
    null,
    { isCollapsed: true },
    { rangeCount: 2 },
    value("outside"),
    value("inside", "outside"),
  ])
    assert.equal(selection.selectedMessageText(root, other), "");
});

async function messageComponent(message, { group = false, pointer } = {}) {
  const h = hooks(),
    copied = [],
    replies = [],
    teamDrafts = [];
  let selected = null;
  const types = {
    TextMessage: 101,
    AtTextMessage: 106,
    QuoteMessage: 114,
    CustomMessage: 110,
    PictureMessage: 102,
    FileMessage: 104,
    VoiceMessage: 103,
  };
  const imports = {
    react: h.react,
    "react/jsx-runtime": jsxRuntime,
    clsx: () => "",
    antd: { Dropdown: "dropdown" },
    "@ant-design/icons": {},
    "@openim/wasm-client-sdk": { MessageType: types, SessionType: { Single: 1 } },
    "@/research/chat-reply": {
      readableMessage: (value) =>
        value.textElem?.content ||
        (value.contentType === 102
          ? "[图片]"
          : value.contentType === 104
          ? "[文件] file.pdf"
          : ""),
      selectChatReply: (...args) => replies.push(args),
    },
    "@/research/chat-message-copy": selection,
    "@/research/chat-timeline": {
      useChatTimeline: (selector) =>
        selector({ scope: "3:chat", selecting: false, selected: [] }),
      registerTimelineMessage() {},
      timelineScope: (generation, id) => `${generation}:${id}`,
      researchPointer: () => pointer,
      selectTimelineMessage() {},
    },
    "@/research/GroupChatRoster": {
      useGroupChatRoster: () => ({}),
      groupContactDescription: () => "",
    },
    "@/research/ResearchAvatar": () => null,
    "@/research/TeamWorkPanel": {
      useTeamWorkDraft: { getState: () => ({ choose: (value) => teamDrafts.push(value) }) },
    },
    "@/utils/common": { feedbackToast() {} },
    "@/utils/imCommon": { formatMessageTime: () => "" },
    "@/store": {
      useConversationStore: (selector) =>
        selector({ currentConversation: { conversationType: group ? 3 : 1 } }),
    },
    "@/research/store": { useResearchStore: (selector) => selector({ generation: 3 }) },
    "./message-item.module.scss": {},
  };
  for (const name of [
    "QuoteMessageRender",
    "CatchMsgRenderer",
    "MediaMessageRender",
    "MessageItemErrorBoundary",
    "MessageSuffix",
    "TextMessageRender",
    "FileMessageRender",
    "SoundMessageRender",
  ])
    imports["./" + name] = () => null;
  imports["@/research/ResearchMessageRender"] = () => null;
  const code = await load(
    "../src/pages/chat/queryChat/MessageItem/index.tsx",
    imports,
    {
      window: { getSelection: () => selected },
      navigator: { clipboard: { writeText: async (value) => copied.push(value) } },
    },
  );
  const find = (node) =>
    node?.type === "dropdown"
      ? node
      : (Array.isArray(node?.props?.children)
          ? node.props.children
          : [node?.props?.children]
        )
          .filter(Boolean)
          .map(find)
          .find(Boolean);
  const tree = () => {
    h.begin();
    return code.default({ message, isSender: false, conversationID: "chat" });
  };
  const render = () => find(tree());
  return {
    render,
    tree,
    copied,
    replies,
    teamDrafts,
    selection: (value) => {
      selected = value;
    },
  };
}
test("only canonical group messages open a team task draft with their exact source and account generation", async () => {
  const message = { clientMsgID: "im-message", contentType: 101, status: 2, textElem: { content: "比较这两篇文献" } };
  const pointer = { conversationId: "group-business-id", messageId: "source-business-id" };
  for (const options of [{}, { group: true }, { pointer }]) {
    const f = await messageComponent(message, options);
    assert.equal(f.render().props.menu.items.some((item) => item.key === "team-work"), false);
  }
  const f = await messageComponent(message, { group: true, pointer });
  const menu = f.render();
  assert.equal(menu.props.menu.items.find((item) => item.key === "team-work").label, "安排文献任务…");
  menu.props.menu.onClick({ key: "team-work" });
  assert.deepEqual(JSON.parse(JSON.stringify(f.teamDrafts)), [{ ...pointer, generation: 3 }]);
});
test("text messages copy the whole actual message or a snapshot of only their own selected words", async () => {
  const f = await messageComponent({
    clientMsgID: "m",
    contentType: 101,
    textElem: { content: "完整的科研消息" },
  });
  let menu = f.render();
  assert.equal(menu.props.menu.items.find((item) => item.key === "copy").label, "复制");
  menu.props.menu.onClick({ key: "copy" });
  await flush();
  assert.equal(f.copied[0], "完整的科研消息");
  f.selection({
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({ startContainer: "inside", endContainer: "inside" }),
    toString: () => "科研",
  });
  menu.props.children.props.onContextMenu({
    currentTarget: { contains: (node) => node === "inside" },
  });
  menu = f.render();
  assert.equal(
    menu.props.menu.items.find((item) => item.key === "copy").label,
    "复制选中文字",
  );
  f.selection(null); // Popup focus may clear the browser selection, but must preserve its captured text.
  menu.props.menu.onClick({ key: "copy" });
  await flush();
  assert.equal(f.copied[1], "科研");
});
test("image and file placeholders are never presented as copyable message text; image has no inherited dropdown", async () => {
  for (const type of [102, 104, 103]) {
    const f = await messageComponent({ clientMsgID: "m", contentType: type });
    const menu = f.render();
    assert.equal(
      menu.props.menu.items.some((i) => i.key === "copy"),
      false,
    );
    assert.equal(Boolean(menu.props.disabled), type === 102 || type === 104);
    menu.props.menu.onClick({ key: "copy" });
    assert.equal(f.copied.length, 0);
  }
});

test("message context menu groups actions, supports keyboard, and renders no duplicate inline action buttons", async () => {
  const f = await messageComponent({
    clientMsgID: "m",
    contentType: 101,
    status: 2,
    textElem: { content: "实验对照" },
  });
  const menu = f.render();
  assert.equal(menu.props.overlayClassName, "chat-message-menu");
  assert.deepEqual(Array.from(menu.props.menu.items, (i) => i.key).filter(Boolean), [
    "copy",
    "forward",
    "select",
    "reply",
    "delete",
  ]);
  assert.equal(menu.props.menu.items.filter((i) => i.type === "divider").length, 2);
  assert.equal(menu.props.menu.items.at(-1).danger, true);
  const walk = (node) =>
    node && typeof node === "object"
      ? [node, ...[node.props?.children].flat(Infinity).flatMap(walk)]
      : [];
  assert.equal(
    walk(f.tree()).filter((n) => n.props?.className === "desktop-reply-action").length,
    0,
  );
  let prevented = false;
  menu.props.children.props.onKeyDown({
    key: "F10",
    shiftKey: true,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(f.render().props.open, true);
  f.render().props.menu.onClick({ key: "reply" });
  assert.equal(f.replies[0][0].clientMsgID, "m");
  assert.equal(f.render().props.open, false);
});

test("image and preview menus include shared message actions without reading image bytes when forwarding", async () => {
  const f = await imageComponent(),
    forwarded = [];
  f.props.messageMenu = {
    items: [
      { key: "forward", label: "转发…" },
      { key: "select", label: "多选" },
      { key: "reply", label: "引用" },
      { type: "divider" },
      { key: "delete", label: "删除", danger: true },
    ],
    onClick: (info) => forwarded.push(info.key),
  };
  const bubble = f.render().props.children[0];
  assert.deepEqual(Array.from(bubble.props.menu.items, (i) => i.key).filter(Boolean), [
    "copy",
    "forward",
    "select",
    "reply",
    "save",
    "ocr",
    "delete",
  ]);
  await f.action("forward");
  assert.deepEqual(forwarded, ["forward"]);
  assert.equal(f.calls.length, 0);
});
