import { SmileOutlined } from "@ant-design/icons";
import { Dropdown } from "antd";
import { useEffect, useId, useRef, useState } from "react";

import { dafeiyuStickers } from "@/assets/dafeiyu-stickers/catalog";

import "./sticker-picker.scss";

const workEmojis = [
  { symbol: "👍", label: "赞同" },
  { symbol: "✅", label: "完成" },
  { symbol: "🤝", label: "合作" },
  { symbol: "🙏", label: "感谢" },
  { symbol: "💡", label: "想法" },
  { symbol: "📝", label: "记录" },
];

function PickerPanel({
  id,
  close,
  insertEmoji,
  sendSticker,
}: {
  id: string;
  close: (restoreFocus?: boolean) => void;
  insertEmoji: (emoji: string) => void;
  sendSticker: (id: string, label: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      id={id}
      className="chat-sticker-picker"
      role="dialog"
      aria-label="选择表情"
      tabIndex={-1}
      ref={panel}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (
          next &&
          !event.currentTarget.contains(next) &&
          next.getAttribute("aria-controls") !== id
        )
          close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          // Dropdown's menu navigation intercepts Tab, but the picker uses normal buttons.
          event.stopPropagation();
        } else if (event.key === "Escape") {
          event.stopPropagation();
          event.preventDefault();
          close(true);
        }
      }}
    >
      <section aria-label="大肥鱼娘贴纸">
        <div className="chat-sticker-picker-heading">
          <h2>大肥鱼娘</h2>
          <span>点击发送</span>
        </div>
        <div className="chat-sticker-picker-grid">
          {dafeiyuStickers.map((sticker) => (
            <button
              type="button"
              key={sticker.id}
              aria-label={`发送贴纸：${sticker.label}`}
              title={sticker.label}
              onClick={() => {
                sendSticker(sticker.id, sticker.label);
                close(true);
              }}
            >
              <img src={sticker.url} alt="" width={52} height={52} decoding="async" />
            </button>
          ))}
        </div>
      </section>
      <section className="chat-sticker-picker-work" aria-label="工作常用表情">
        <h2>工作常用</h2>
        <div className="chat-sticker-picker-emoji">
          {workEmojis.map(({ symbol, label }) => (
            <button
              type="button"
              key={symbol}
              aria-label={`插入表情：${label}`}
              title={label}
              onClick={() => {
                close();
                insertEmoji(symbol);
              }}
            >
              {symbol}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function StickerPicker({
  insertEmoji,
  sendSticker,
}: {
  insertEmoji: (emoji: string) => void;
  sendSticker: (id: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <Dropdown
      trigger={["click"]}
      placement="topLeft"
      open={open}
      onOpenChange={setOpen}
      destroyPopupOnHide
      dropdownRender={() => (
        <PickerPanel
          id={id}
          close={(restoreFocus) => {
            setOpen(false);
            if (restoreFocus) trigger.current?.focus({ preventScroll: true });
          }}
          insertEmoji={insertEmoji}
          sendSticker={sendSticker}
        />
      )}
    >
      <button
        ref={trigger}
        type="button"
        className="chat-tool-button"
        aria-label="表情"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="表情"
      >
        <SmileOutlined />
      </button>
    </Dropdown>
  );
}
