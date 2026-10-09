import { CloseOutlined, CopyOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button, Input, Modal } from "antd";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { imagePasteLimits } from "@/types/imageClipboard";
import { useAgentChatOperation } from "./useAgentChatOperation";
import type { AgentChatOperation } from "./useAgentChatOperation";

type ImageDraft = {
  id: string;
  file: File;
  url: string;
  text?: string;
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
    [busy, setBusy] = useState(false);
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
    job.current = active;
    setBusy(true);
    setNotice("");
    setResultsOpen(true);
    try {
      for (const item of drafts.current.slice()) {
        if (item.text !== undefined && !item.error) continue;
        if (!operation.isCurrent() || !alive.current || job.current !== active) break;
        patch(item.id, { reading: true, error: undefined });
        try {
          const bytes = new Uint8Array(await item.file.arrayBuffer());
          if (!operation.isCurrent() || job.current !== active) break;
          const result = await window.electronAPI.recognizeChatImage(id, bytes);
          if (!operation.isCurrent() || !alive.current || job.current !== active) break;
          patch(item.id, {
            text: result.text,
            language: result.language,
            reading: false,
            error: result.text.trim()
              ? undefined
              : "这张图片没有识别到文字，可换清晰原图后重试。",
          });
        } catch (error) {
          if (!alive.current || !operation.isCurrent() || job.current !== active) break;
          patch(item.id, {
            reading: false,
            error: error instanceof Error ? error.message : "图片识别失败，请重试。",
          });
        }
      }
    } finally {
      operation.dispose();
      if (alive.current && job.current === active) {
        job.current = undefined;
        setBusy(false);
        update(drafts.current.map((item) => ({ ...item, reading: false })));
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
  const combined = images
    .map((item, index) =>
      item.text?.trim() ? `【图片 ${index + 1}：${item.file.name}】\n${item.text}` : "",
    )
    .filter(Boolean)
    .join("\n\n");
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
                <Button
                  size="small"
                  onClick={() => {
                    cancel();
                    setBusy(false);
                    update(
                      drafts.current.map((item) => ({
                        ...item,
                        reading: false,
                        sending: false,
                      })),
                    );
                  }}
                >
                  取消
                </Button>
              )}
            </div>
          </div>
          <div className="image-paste-previews">
            {images.map((item, index) => (
              <div className="image-paste-preview" key={item.id}>
                <img src={item.url} alt={`图片 ${index + 1}：${item.file.name}`} />
                <span>{index + 1}</span>
                {item.reading || item.sending ? (
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
        title="图片识字"
        width={720}
        onCancel={() => setResultsOpen(false)}
        footer={
          <div className="image-ocr-actions">
            <span>
              {busy ? "正在逐张识别…" : "识别在本机进行，请核对数字和专有名词。"}
            </span>
            <Button
              disabled={!combined}
              icon={<CopyOutlined />}
              onClick={() =>
                void navigator.clipboard
                  .writeText(combined)
                  .catch(() => setNotice("复制失败，请在文字框中选择文字后复制。"))
              }
            >
              复制文字
            </Button>
            <Button
              disabled={!combined}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([combined], { type: "text/plain;charset=utf-8" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "图片识别文字.txt";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              保存文字
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
              {item.error && (
                <p role="alert" className="image-ocr-error">
                  {item.error}
                </p>
              )}
              <Input.TextArea
                aria-label={`图片 ${index + 1} 识别文字`}
                value={item.text ?? ""}
                placeholder="识别结果会显示在这里，也可以直接编辑。"
                autoSize={{ minRows: 3, maxRows: 10 }}
                disabled={busy}
                onChange={(event) =>
                  patch(item.id, { text: event.target.value, error: undefined })
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
      </Modal>
    </>
  );
});
export default ImagePasteTray;
