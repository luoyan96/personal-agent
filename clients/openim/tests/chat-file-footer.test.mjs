import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as stickerMessage from "../src/research/chat-sticker-message.ts";

// Exercise the actual composer events and asynchronous pump with controlled
// stores/SDK/API. The document preparation module is also the real source.
async function fixture({
  failOnce = false,
  failStickerOnce = false,
  agent = true,
  group = false,
  ownAssistant = false,
  consultation = false,
  consultationError,
} = {}) {
  const state = [],
    refs = [],
    dependencies = [],
    effects = [];
  let cursor = 0,
    tree,
    serial = 0;
  const source = await readFile(
    new URL("../src/pages/chat/queryChat/ChatFooter/index.tsx", import.meta.url),
    "utf8",
  );
  const transpile = (source) =>
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
  const store = (value) =>
    Object.assign((selector) => selector(value), {
      getState: () => value,
      setState: (patch) =>
        Object.assign(value, typeof patch === "function" ? patch(value) : patch),
    });
  const actor = {
    actor: { member: { id: "synthetic-actor" } }, generation: 1,
    ...(ownAssistant ? {
      sessionActorId: "synthetic-actor",
      session: { coordinator: { kind: "personal", imConversationID: "synthetic-im",
        peerUserID: "assistant", researchConversationId: "synthetic-agent" } },
    } : {}),
  };
  const conversation = {
    conversationID: "synthetic-im",
    userID: group ? "" : agent ? "assistant" : "colleague",
    groupID: group ? "synthetic-group" : "",
  };
  const outbox = store({ items: [], notice: "" });
  const calls = [],
    notices = [],
    drafts = new Map();
  const capture = () => {
    const controller = new AbortController();
    return {
      signal: controller.signal,
      isCurrent: () => !controller.signal.aborted,
      dispose: () => controller.abort(),
    };
  };
  const react = {
    memo: (component) => component,
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [
        state[i],
        (patch) => {
          state[i] = typeof patch === "function" ? patch(state[i]) : patch;
        },
      ];
    },
    useRef(value) {
      return (refs[cursor++] ||= { current: value });
    },
    useEffect(callback, deps) {
      const i = cursor++,
        old = dependencies[i];
      if (!old || deps.some((value, n) => value !== old[n])) effects.push(callback);
      dependencies[i] = deps;
    },
  };
  const jsx = (type, props) => {
    if (type === "ImageTray") props.ref.current = { snapshot: () => [], commit() {} };
    return { type, props };
  };
  const prepared = {
    route: "agentChatMessage",
    conversationId: "synthetic-agent",
    body: { text: "question" },
  };
  const receipt = {
    message: { id: "canonical-file-message" },
    turn: { id: "canonical-file-turn" },
  };
  const composer = {
    isGroup: group,
    consultation,
    mentionContacts: [],
    invalid: false,
    prepareResearch: (text) => {
      if (consultationError) throw new Error(consultationError);
      return agent ? { ...prepared, body: { text } } : undefined;
    },
    acceptSendIntent: () => 1,
    async sendPrepared(request, key) {
      calls.push({ kind: "api", request: structuredClone(request), key });
      if (failOnce) {
        failOnce = false;
        throw Error("synthetic acknowledgement lost");
      }
      return receipt;
    },
  };
  const imports = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    ahooks: { useLatest: (value) => ({ current: value }) },
    antd: { Button: "Button" },
    i18next: { t: (key) => key },
    "@openim/wasm-client-sdk": { MessageType: { CustomMessage: 110 } },
    "@ant-design/icons": { CloseOutlined: "Close" },
    "@/research/chat-reply": {
      useChatReply: () => undefined,
      replyKey: () => "reply",
      clearChatReply() {},
    },
    "@/research/GroupChatRoster": { useGroupChatRoster: () => ({}) },
    "@/research/group-members": {},
    "@/research/group-mentions": {},
    "@/research/ResearchComposer": { useResearchComposer: () => composer },
    "@/research/store": { useResearchStore: store(actor) },
    "@/components/CKEditor": { default: "Editor" },
    "@/components/CKEditor/utils": { getCleanText: (text) => text },
    "@/research/mention-composer": {
      readMentionComposer: (text) => ({ text, mentions: [] }),
    },
    "@/research/chat-timeline": {},
    "@/research/chat-message-read": { hasMessageDetails: () => false },
    "@/i18n": { default: { on() {} } },
    "@/layout/MainContentWrap": {
      IMSDK: {
        createTextMessage: async (text) => ({ data: { text } }),
        createFaceMessage: async (faceElem) => {
          calls.push({ kind: "make-sticker" });
          return { data: { clientMsgID: "stable-sdk-sticker", contentType: 115, faceElem } };
        },
      },
    },
    "@/store": { useConversationStore: store({ currentConversation: conversation }) },
    "@/utils/common": { feedbackToast: (value) => notices.push(value) },
    "./SendActionBar": { default: "Actions" },
    "@/research/ImagePasteTray": { default: "ImageTray" },
    "@/research/composer-files": {
      isComposerImage: (file) => file.type.startsWith("image/"),
      normalizeComposerImage: (file) => file,
    },
    "./SendActionBar/useFileMessage": {
      useFileMessage: () => ({
        getFileMessage: async (file) => {
          calls.push({ kind: "make", name: file.name });
          return { clientMsgID: "stable-sdk-file", contentType: 105 };
        },
      }),
    },
    "./useSendMessage": {
      useSendMessage: () => ({
        sendMessage: async (args) => {
          calls.push({ kind: "sdk", args });
          if (args.message.contentType === 115 && failStickerOnce) {
            failStickerOnce = false;
            throw Error("synthetic sticker acknowledgement lost");
          }
        },
      }),
    },
    "@/research/useAgentFileReading": {
      useAgentFileReading: () => ({
        onFileSent: () => calls.push({ kind: "legacy-read" }),
      }),
    },
    "@/research/useAgentImageReading": {
      directImageAgent: () => (agent ? "synthetic-agent" : undefined),
      useAgentImageReading: () => ({}),
    },
    "@/research/chat-image-submission": { assertImageQueueCapacity() {} },
    "@/research/useScopedFileSender": {
      useScopedFileSender: () => async (file) => {
        calls.push({ kind: "legacy-send", name: file.name });
        return true;
      },
    },
    "@/research/useAgentChatOperation": { useAgentChatOperation: () => capture },
    "@/research/chat-sticker-message": stickerMessage,
    "@/research/request-deadline": {
      withRequestDeadline: (run, _, signal) => run(signal),
      assertRequestActive() {},
    },
    "@/utils/events": { default: { on() {}, off() {} } },
    "./desktop-chat.scss": {},
    "@/research/chat-outbox": {
      chatDrafts: drafts,
      saveChatDraft: (id, text) => (text ? drafts.set(id, text) : drafts.delete(id)),
      useChatOutbox: outbox,
      pendingSubmissions: (items) =>
        items.filter((item) => item.state !== "acknowledged"),
      updateSubmission: (id, patch) =>
        outbox.setState({
          items: outbox
            .getState()
            .items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }),
      removeSubmission: (id) =>
        outbox.setState({
          items: outbox.getState().items.filter((item) => item.id !== id),
        }),
      assertSubmissionCapacity() {},
    },
  };
  const helper = { exports: {} };
  vm.runInNewContext(
    transpile(
      await readFile(
        new URL("../src/research/chat-file-submission.ts", import.meta.url),
        "utf8",
      ),
    ),
    {
      module: helper,
      exports: helper.exports,
      Uint8Array,
      btoa,
    },
  );
  imports["@/research/chat-file-submission"] = helper.exports;
  const module = { exports: {} };
  vm.runInNewContext(transpile(source), {
    module,
    exports: module.exports,
    Error,
    window: {},
    crypto: { randomUUID: () => `id-${++serial}` },
    require: (name) => {
      assert(Object.hasOwn(imports, name), name);
      return imports[name];
    },
  });
  function render() {
    cursor = 0;
    tree = module.exports.default();
    effects.splice(0).forEach((callback) => callback());
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node))
      return node.map((child) => find(predicate, child ?? null)).find(Boolean);
    if (predicate(node)) return node;
    return find(predicate, node.props?.children ?? null);
  }
  render();
  render();
  return {
    calls,
    notices,
    outbox,
    render,
    find,
    stage(files) {
      find((node) => node.type === "Actions").props.stageFiles(files);
      render();
    },
    type(text) {
      find((node) => node.type === "Editor").props.onChange(text);
      render();
    },
    send() {
      find((node) => node.props?.["aria-label"] === "发送消息").props.onClick();
    },
    sendSticker() {
      find((node) => node.type === "Actions").props.sendSticker("wave", "挥手打招呼");
    },
  };
}
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};
const document = () =>
  new File(["Control group\nTreatment group\n".padEnd(101, " ")], "groups.md");

test("real Footer send uses the uploaded Markdown bytes and question in exactly one API request", async () => {
  const f = await fixture();
  f.stage([document()]);
  f.type("How many groups?");
  f.send();
  await settle();
  assert.deepEqual(
    f.calls.map((call) => call.kind),
    ["make", "sdk", "api"],
  );
  const api = f.calls.find((call) => call.kind === "api");
  assert.equal(api.request.route, "agentFileMessage");
  assert.equal(api.request.body.text, "How many groups?");
  assert.equal(Buffer.from(api.request.body.contentBase64, "base64").length, 101);
  assert.equal(f.outbox.getState().items[0].state, "acknowledged");
  assert.equal(
    f.outbox.getState().items[0].receipt.message.id,
    "canonical-file-message",
  );
});

test("real Footer lost acknowledgement has one recovery owner and retries without file reupload or duplicate question", async () => {
  const f = await fixture({ failOnce: true });
  f.stage([document()]);
  f.type("How many groups?");
  f.send();
  await settle();
  f.render();
  assert.equal(f.outbox.getState().items[0].state, "failed");
  const retry = f.find(
    (node) => node.type === "Button" && node.props.children === "重试原消息",
  );
  assert.ok(retry);
  retry.props.onClick();
  await settle();
  assert.deepEqual(
    f.calls.map((call) => call.kind),
    ["make", "sdk", "api", "api"],
  );
  assert.deepEqual(f.calls[2], f.calls[3]);
  assert.equal(f.outbox.getState().items[0].state, "acknowledged");
});

test("real Footer multi-document rejection retains question and both staged documents without creating API work", async () => {
  const f = await fixture();
  f.stage([document(), document()]);
  f.type("Compare these files");
  f.send();
  f.render();
  assert.equal(f.outbox.getState().items.length, 0);
  assert.equal(f.calls.length, 0);
  assert.match(f.notices[0].error.message, /每条消息暂时只能读取一个文档/);
  assert.equal(
    f.find((node) => node.type === "Editor").props.value,
    "Compare these files",
  );
  const tray = f.find(
    (node) => node.type === "section" && node.props["aria-label"] === "待发送文件",
  );
  assert.equal(tray.props.children.length, 2);
});

test("real Footer file-only message requests one document reading rather than dropping the attachment", async () => {
  const f = await fixture();
  f.stage([document()]);
  f.send();
  await settle();
  assert.deepEqual(
    f.calls.map((call) => call.kind),
    ["make", "sdk", "api"],
  );
  assert.equal(f.calls[2].request.route, "agentFileMessage");
  assert.equal(f.calls[2].request.body.text, undefined);
});

test("consultation rejects attachments and sends text only to the canonical Agent endpoint", async () => {
  const f = await fixture({ consultation: true });
  f.stage([document()]);
  assert.equal(f.find((node) => node.type === "Actions").props.textOnly, true);
  assert.equal(f.find((node) => node.type === "ImageTray"), undefined);
  assert.match(f.notices[0].msg, /只支持文字/);
  f.type("Can you explain this method?");
  f.send();
  await settle();
  assert.deepEqual(f.calls.map(({ kind, request }) => [kind, request.route, request.body.text]), [
    ["api", "agentChatMessage", "Can you explain this method?"],
  ]);
});

test("a consultation sticker uses the canonical text route and keeps the draft", async () => {
  const f = await fixture({ consultation: true });
  f.type("待发草稿");
  f.sendSticker();
  await settle();
  f.render();
  assert.deepEqual(f.calls.map(({ kind, request }) => [kind, request.route, request.body.text]), [
    ["api", "agentChatMessage", "[大肥鱼娘贴纸] 挥手打招呼"],
  ]);
  assert.equal(f.find((node) => node.type === "Editor").props.value, "待发草稿");
});

test("a consultation sticker cannot bypass the canonical send gate", async () => {
  for (const options of [
    { consultationError: "这位助理暂不开放咨询。" },
    { consultationError: "请先在模型设置中配置你的模型 API。" },
    { agent: false },
  ]) {
    const f = await fixture({ consultation: true, ...options });
    f.sendSticker();
    await settle();
    assert.deepEqual(f.calls, []);
    assert.equal(f.outbox.getState().items.length, 0);
    assert.equal(f.notices[0].msg, options.consultationError ?? "正在同步咨询会话，请稍后再试。");
  }
});

test("one sticker sends through OpenIM in other assistant and human DMs and groups with the draft untouched", async () => {
  for (const [options, recvID, groupID] of [
    [{ agent: true }, "assistant", ""],
    [{ agent: false }, "colleague", ""],
    [{ agent: false, group: true }, "", "synthetic-group"],
  ]) {
    const f = await fixture(options);
    f.type("待发草稿");
    f.sendSticker();
    await settle();
    f.render();
    assert.deepEqual(f.calls.map((call) => call.kind), ["make-sticker", "sdk"]);
    assert.equal(f.calls[1].args.recvID, recvID);
    assert.equal(f.calls[1].args.groupID, groupID);
    assert.equal(stickerMessage.readStickerId(f.calls[1].args.message), "wave");
    assert.equal(f.find((node) => node.type === "Editor").props.value, "待发草稿");
    assert.equal(f.outbox.getState().items.length, 0);
  }
});

test("failed SDK sticker send reuses its original message ID without calling the assistant API", async () => {
  const f = await fixture({ failStickerOnce: true });
  f.sendSticker();
  await settle();
  f.render();
  const retry = f.find((node) => node.type === "Button" && node.props.children === "重试原消息");
  assert.ok(retry);
  retry.props.onClick();
  await settle();
  assert.deepEqual(f.calls.map((call) => call.kind), ["make-sticker", "sdk", "sdk"]);
  assert.equal(f.calls[1].args.message.clientMsgID, f.calls[2].args.message.clientMsgID);
  assert.equal(f.outbox.getState().items.length, 0);
});

test("own assistant sticker creates one labeled canonical input and retries with the original idempotency key", async () => {
  const f = await fixture({ ownAssistant: true, failOnce: true });
  f.type("待发草稿");
  f.sendSticker();
  await settle();
  f.render();
  const retry = f.find((node) => node.type === "Button" && node.props.children === "重试原消息");
  assert.ok(retry);
  retry.props.onClick();
  await settle();
  f.render();
  assert.deepEqual(f.calls.map((call) => call.kind), ["api", "api"]);
  assert.deepEqual(f.calls[0], f.calls[1]);
  assert.equal(f.calls[1].request.conversationId, "synthetic-agent");
  assert.equal(f.calls[1].request.route, "agentChatMessage");
  assert.deepEqual(f.calls[1].request.body, { text: "[大肥鱼娘贴纸] 挥手打招呼", continuous: true });
  assert.equal(f.outbox.getState().items[0].state, "acknowledged");
  assert.equal(f.find((node) => node.type === "Editor").props.value, "待发草稿");
});
