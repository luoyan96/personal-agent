import { CloseOutlined, CopyOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button, Checkbox, Input, Modal, Segmented } from "antd";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { imagePasteLimits } from "@/types/imageClipboard";
import { useAgentChatOperation } from "./useAgentChatOperation";
import type { AgentChatOperation } from "./useAgentChatOperation";
import { directImageAgent } from "./useAgentImageReading";
import { formatOcrText } from "@/utils/ocrText";
import type { OcrTextMode } from "@/utils/ocrText";
import { proofreadOcr } from "./ocrProofreading";
import type { OcrProofreadingJob } from "./ocrProofreading";

type ImageDraft = {
  id: string;
  file: File;
  url: string;
  text?: string;
  paragraphText?: string;
  refinedText?: string;
  edits?: Partial<Record<OcrTextMode, string>>;
  refinementJob?: OcrProofreadingJob;
  refinementError?: string;
  refining?: boolean;
  error?: string;
  reading?: boolean;
  sending?: boolean;
  language?: string;
};
export type ImagePasteTrayRef = {
  paste: (event: ClipboardEvent) => void;
  readClipboard: () => void;
  stage: (files: File[]) => void;
};
/** Images stay on this computer until the user explicitly sends them or OCR text. */
const ImagePasteTray = forwardRef<
  ImagePasteTrayRef,
  {
    sendFile: (file: File, kind: "image", isCurrent: () => boolean) => Promise<boolean>;
    insertText: (text: string) => void;
  }
>(({ sendFile, insertText }, ref) => {
  const [images, setImages] = useState<ImageDraft[]>([]),
    [notice, setNotice] = useState(""),
    [resultsOpen, setResultsOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<OcrTextMode>("continuous"),
    [agentProofreading, setAgentProofreading] = useState(true),
    [copied, setCopied] = useState(false),
    [saving, setSaving] = useState(false),
    [resultNotice, setResultNotice] = useState("");
  const agentConversationId = directImageAgent();
  const drafts = useRef<ImageDraft[]>([]),
    urls = useRef(new Set<string>()),
    alive = useRef(false),
    job = useRef<{ id: string; operation: AgentChatOperation }>();
  const capture = useAgentChatOperation();
  const update = (items: ImageDraft[]) => {
    drafts.current = items;
    setImages(items);
  };
  const patch = (id: string, changes: Partial<ImageDraft>) =>
    update(
      drafts.current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  const cancel = () => {
    if (job.current) {
      const active = job.current;
      job.current = undefined;
      active.operation.dispose();
      void window.electronAPI?.cancelChatImageOcr(active.id).catch(() => {});
    }
  };
  const stop = () => {
    cancel();
    setBusy(false);
    update(
      drafts.current.map((item) => ({
        ...item,
        reading: false,
        refining: false,
        sending: false,
        refinementJob:
          item.refining && item.refinementJob?.receipt
            ? { ...item.refinementJob, terminal: true }
            : item.refinementJob,
      })),
    );
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancel();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    };
  }, []);
  const stage = (files: File[]) => {
    if (!alive.current || !files.length) return;
    if (drafts.current.length + files.length > imagePasteLimits.count) {
      setNotice("每次最多处理 20 张图片，请先发送或移除已有图片。");
      return;
    }
    if (
      files.some(
        (file) =>
          !file.type.startsWith("image/") ||
          !file.size ||
          file.size > imagePasteLimits.bytes,
      )
    ) {
      setNotice("请选择图片文件；每张图片不能超过 10 MB。");
      return;
    }
    if (
      [...drafts.current.map((item) => item.file), ...files].reduce(
        (sum, file) => sum + file.size,
        0,
      ) > imagePasteLimits.totalBytes
    ) {
      setNotice("一次图片总大小不能超过 50 MB，请分批处理。");
      return;
    }
    update([
      ...drafts.current,
      ...files.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { id: crypto.randomUUID(), file, url };
      }),
    ]);
    setNotice("");
  };
  const readClipboard = async (fallbackFiles?: File[]) => {
    const operation = capture();
    try {
      if (!window.electronAPI?.readChatClipboardImages) {
        if (fallbackFiles?.length) {
          stage(fallbackFiles);
          return;
        }
        setNotice(
          "这个版本未提供图片剪贴板接口，请安装新版桌面端；也可以选择或拖入图片。",
        );
        return;
      }
      const result = await window.electronAPI.readChatClipboardImages();
      if (!alive.current || !operation.isCurrent()) return;
      if (!result.images.length && fallbackFiles?.length) {
        stage(fallbackFiles);
        return;
      }
      stage(
        result.images.map(
          (image) =>
            new File([image.bytes], image.name, {
              type: /\.jpe?g$/i.test(image.name)
                ? "image/jpeg"
                : /\.webp$/i.test(image.name)
                ? "image/webp"
                : /\.gif$/i.test(image.name)
                ? "image/gif"
                : /\.bmp$/i.test(image.name)
                ? "image/bmp"
                : "image/png",
            }),
        ),
      );
      if (result.notice) setNotice(result.notice);
    } catch (error) {
      if (alive.current && operation.isCurrent()) {
        if (fallbackFiles?.length) {
          stage(fallbackFiles);
          return;
        }
        setNotice(
          error instanceof Error ? error.message : "图片粘贴失败，请重新复制。",
        );
      }
    } finally {
      operation.dispose();
    }
  };
  useImperativeHandle(ref, () => ({
    stage,
    readClipboard: () => void readClipboard(),
    paste: (event) => {
      // Capture before CKEditor's text-only clipboard plugin discards images.
      const files = Array.from(event.clipboardData.files);
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length) {
        event.preventDefault();
        event.stopPropagation();
        // Trusted native paste prefers CF_HDROP: Chromium may expose only the
        // preview bitmap while Windows holds several original image files.
        if (window.electronAPI && event.nativeEvent.isTrusted)
          void readClipboard(imageFiles);
        else stage(imageFiles);
        return;
      }
      const text = event.clipboardData.getData("text/plain");
      if (
        window.electronAPI &&
        (!text || /^file:\/\//i.test(text) || /^(?:\[图片\]\s*)+$/.test(text))
      ) {
        event.preventDefault();
        event.stopPropagation();
        void readClipboard();
      }
      // Ordinary text and formatted text retain CKEditor's usual paste behavior.
    },
  }));
  const remove = (id: string) => {
    const item = drafts.current.find((item) => item.id === id);
    if (!item) return;
    URL.revokeObjectURL(item.url);
    urls.current.delete(item.url);
    update(drafts.current.filter((item) => item.id !== id));
  };
  const recognize = async () => {
    if (job.current || busy || !drafts.current.length) return;
    if (!window.electronAPI?.recognizeChatImage) {
      setNotice("图片识字需要安装新版 Windows 桌面端。");
      return;
    }
    const operation = capture(),
      id = crypto.randomUUID(),
      active = { id, operation };
    const correctionTarget = agentProofreading ? agentConversationId : undefined;
    job.current = active;
    setBusy(true);
    setNotice("");
    setResultsOpen(true);
    try {
      for (const item of drafts.current.slice()) {
        if (!operation.isCurrent() || !alive.current || job.current !== active) break;
        try {
          if (item.text === undefined || item.error) {
            patch(item.id, { reading: true, error: undefined });
            const bytes = new Uint8Array(await item.file.arrayBuffer());
            if (!operation.isCurrent() || job.current !== active) break;
            const result = await window.electronAPI.recognizeChatImage(id, bytes);
            if (!operation.isCurrent() || !alive.current || job.current !== active)
              break;
            patch(item.id, {
              text: result.text,
              paragraphText: result.paragraphText,
              language: result.language,
              reading: false,
              error: result.text.trim()
                ? undefined
                : "这张图片没有识别到文字，可换清晰原图后重试。",
            });
          }
        } catch (error) {
          if (!alive.current || !operation.isCurrent() || job.current !== active) break;
          patch(item.id, {
            reading: false,
            error: error instanceof Error ? error.message : "图片识别失败，请重试。",
          });
        }
        const recognized = drafts.current.find((draft) => draft.id === item.id);
        if (
          !correctionTarget ||
          !recognized?.text?.trim() ||
          recognized.error ||
          recognized.refinedText
        )
          continue;
        if (!operation.isCurrent() || job.current !== active) break;
        const refinementJob = (recognized.refinementJob?.terminal
          ? undefined
          : recognized.refinementJob) || {
          key: `ocr-proofread-${crypto.randomUUID()}`,
          conversationId: correctionTarget,
          text: formatOcrText(
            recognized.paragraphText || recognized.text,
            "paragraphs",
          ),
        };
        patch(item.id, { refining: true, refinementError: undefined, refinementJob });
        try {
          const refinedText = await proofreadOcr(refinementJob, operation.signal);
          if (!operation.isCurrent() || !alive.current || job.current !== active) break;
          patch(item.id, { refinedText, refining: false });
        } catch (error) {
          if (!operation.isCurrent() || !alive.current || job.current !== active) break;
          patch(item.id, {
            refining: false,
            refinementError:
              error instanceof Error
                ? error.message
                : "模型校对未完成，本机文字已保留。",
          });
        }
      }
    } finally {
      operation.dispose();
      if (alive.current && job.current === active) {
        job.current = undefined;
        setBusy(false);
        update(
          drafts.current.map((item) => ({ ...item, reading: false, refining: false })),
        );
      }
    }
  };
  const sendImages = async () => {
    if (busy || job.current) return;
    const operation = capture(),
      active = { id: crypto.randomUUID(), operation };
    job.current = active;
    setBusy(true);
    setNotice("");
    try {
      for (const item of drafts.current.slice()) {
        if (!operation.isCurrent() || !alive.current || job.current !== active) break;
        patch(item.id, { sending: true });
        const sent = await sendFile(item.file, "image", operation.isCurrent);
        if (!operation.isCurrent() || !alive.current || job.current !== active) break;
        if (!sent) {
          patch(item.id, { sending: false });
          setNotice("图片发送失败，未发送的图片已保留，请重试。");
          break;
        }
        remove(item.id);
      }
    } finally {
      operation.dispose();
      if (alive.current && job.current === active) {
        job.current = undefined;
        setBusy(false);
        update(drafts.current.map((item) => ({ ...item, sending: false })));
      }
    }
  };
  const displayedText = (item: ImageDraft) =>
    item.edits?.[mode] ??
    formatOcrText(
      mode === "raw"
        ? item.text || ""
        : item.refinedText ?? item.paragraphText ?? item.text ?? "",
      mode,
    );
  const combined = images
    .map(displayedText)
    .filter(Boolean)
    .join(mode === "continuous" ? " " : "\n\n");
  const unresolved = images.some(
    (item) => item.reading || item.error || item.text === undefined,
  );
  return (
    <>
      {!!notice && (
        <div className="image-paste-notice" role="status">
          {notice}
          <button type="button" aria-label="关闭图片提示" onClick={() => setNotice("")}>
            <CloseOutlined />
          </button>
        </div>
      )}
      {!!images.length && (
        <section className="image-paste-tray" aria-label="待发送图片">
          <div className="image-paste-heading">
            <span>{images.length} 张图片 · 发送前仅保留在本机</span>
            <div>
              <Button size="small" disabled={busy} onClick={() => void recognize()}>
                识别文字
              </Button>
              <Button size="small" disabled={busy} onClick={() => void sendImages()}>
                发送图片
              </Button>
              {images.some((item) => item.text !== undefined || item.error) && (
                <Button size="small" onClick={() => setResultsOpen(true)}>
                  查看文字
                </Button>
              )}
              {busy && (
                <Button size="small" onClick={stop}>
                  取消
                </Button>
              )}
            </div>
          </div>
          {agentConversationId && (
            <div className="image-ocr-consent">
              <Checkbox
                checked={agentProofreading}
                disabled={busy}
                onChange={(event) => setAgentProofreading(event.target.checked)}
              >
                Agent 校对错字
              </Checkbox>
              <span>
                {agentProofreading
                  ? "点击识别后，文字会发送给当前 Agent 校对。"
                  : "仅本机识别并整理换行。"}
              </span>
            </div>
          )}
          {!!directImageAgent() && (
            <p className="text-xs text-slate-500">
              发送给此 Agent 后，会自动在本机识别文字并请求回复。
            </p>
          )}
          <div className="image-paste-previews">
            {images.map((item, index) => (
              <div className="image-paste-preview" key={item.id}>
                <img src={item.url} alt={`图片 ${index + 1}：${item.file.name}`} />
                <span>{index + 1}</span>
                {item.reading || item.refining || item.sending ? (
                  <LoadingOutlined className="image-paste-remove" />
                ) : (
                  <button
                    className="image-paste-remove"
                    type="button"
                    disabled={busy}
                    aria-label={`移除图片 ${index + 1}`}
                    onClick={() => remove(item.id)}
                  >
                    <CloseOutlined />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      <Modal
        open={resultsOpen}
        title="图片文字"
        width={800}
        onCancel={() => setResultsOpen(false)}
        footer={
          <div className="image-ocr-actions">
            {busy && <Button onClick={stop}>停止整理</Button>}
            <span>
              {busy
                ? "正在识别与整理，完成后可复制正文…"
                : mode === "raw"
                ? "当前展示原始识别，整理后的正文仍保留。"
                : "复制、保存和插入均使用当前正文格式。"}
            </span>
            <Button
              aria-label={copied ? "已复制" : "复制正文"}
              disabled={busy || !combined}
              icon={<CopyOutlined />}
              onClick={() =>
                void navigator.clipboard
                  .writeText(combined)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => setNotice("复制失败，请在文字框中选择文字后复制。"))
              }
            >
              {copied ? "已复制" : "复制正文"}
            </Button>
            <Button
              loading={saving}
              disabled={busy || saving || !combined}
              onClick={async () => {
                const operation = capture();
                setResultNotice("");
                setSaving(true);
                try {
                  if (window.electronAPI?.saveChatImageText) {
                    const saved = await window.electronAPI.saveChatImageText(
                      combined,
                      mode === "raw",
                    );
                    if (alive.current && operation.isCurrent() && saved)
                      setResultNotice("文字已保存到你选择的位置。");
                    return;
                  }
                  const url = URL.createObjectURL(
                    new Blob([combined], { type: "text/plain;charset=utf-8" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = mode === "raw" ? "图片原始识别.txt" : "图片整理正文.txt";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (error) {
                  if (alive.current && operation.isCurrent())
                    setResultNotice(
                      error instanceof Error
                        ? error.message
                        : "保存未完成，正文仍已保留。",
                    );
                } finally {
                  if (alive.current) setSaving(false);
                  operation.dispose();
                }
              }}
            >
              保存正文
            </Button>
            <Button
              type="primary"
              disabled={busy || unresolved || !combined || combined.length > 7500}
              onClick={() => {
                insertText(combined);
                setResultsOpen(false);
                setNotice("识别文字已放入输入框，可补充要求后发送给 Agent。");
              }}
            >
              插入聊天
            </Button>
            {combined.length > 7500 && <span>文字较长，请保存或分段复制发送。</span>}
          </div>
        }
      >
        <div className="image-ocr-format">
          <Segmented
            aria-label="文字格式"
            value={mode}
            options={[
              { label: "一整段 · 无回车", value: "continuous" },
              { label: "保留段落", value: "paragraphs" },
              { label: "原始识别", value: "raw" },
            ]}
            onChange={(value) => {
              setMode(value as OcrTextMode);
              setCopied(false);
            }}
          />
          <p>
            {mode === "raw"
              ? "保留本机识别的行，便于与正文对照。"
              : "已合并截图换行和中文多余空格。可编辑，编辑内容会随当前格式保留。"}
          </p>
          {resultNotice && <p role="status">{resultNotice}</p>}
          {agentConversationId && (
            <Checkbox
              checked={agentProofreading}
              disabled={busy}
              onChange={(event) => setAgentProofreading(event.target.checked)}
            >
              Agent 校对错字 · 文字会发送给当前 Agent
            </Checkbox>
          )}
        </div>
        <div className="image-ocr-results">
          {images.map((item, index) => (
            <section key={item.id}>
              <h3>
                图片 {index + 1} · {item.file.name}
              </h3>
              {item.language && !item.language.startsWith("zh") && (
                <p className="image-paste-notice">
                  当前使用 {item.language} 识别。识别中文需在 Windows
                  设置中安装中文语言包。
                </p>
              )}
              {item.reading && (
                <p role="status">
                  <LoadingOutlined /> 正在识别…
                </p>
              )}
              {item.refining && (
                <p role="status">
                  <LoadingOutlined /> 正在由当前 Agent 校对错字，本机正文已保留…
                </p>
              )}
              {item.refinedText && mode !== "raw" && (
                <p className="image-ocr-complete">Agent 校对稿 · 可切换原始识别对照</p>
              )}
              {item.refinementError && (
                <p role="alert" className="image-ocr-error">
                  校对未完成：{item.refinementError}
                </p>
              )}
              {item.error && (
                <p role="alert" className="image-ocr-error">
                  {item.error}
                </p>
              )}
              <Input.TextArea
                aria-label={`图片 ${index + 1} 识别文字`}
                value={displayedText(item)}
                placeholder="识别结果会显示在这里，也可以直接编辑。"
                autoSize={{ minRows: 3, maxRows: 10 }}
                disabled={busy}
                onChange={(event) =>
                  patch(item.id, {
                    edits: { ...item.edits, [mode]: event.target.value },
                  })
                }
              />
            </section>
          ))}
        </div>
        {images.some((item) => item.error) && (
          <Button disabled={busy} onClick={() => void recognize()}>
            重试失败图片
          </Button>
        )}
        {agentConversationId &&
          !busy &&
          images.some((item) => item.text && !item.error && !item.refinedText) && (
            <Button disabled={!agentProofreading} onClick={() => void recognize()}>
              {images.some((item) => item.refinementError)
                ? "重试校对"
                : "让 Agent 校对错字"}
            </Button>
          )}
      </Modal>
    </>
  );
});
export default ImagePasteTray;
