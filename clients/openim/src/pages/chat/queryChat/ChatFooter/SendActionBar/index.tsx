import { FolderOpenOutlined, SmileOutlined } from "@ant-design/icons";
import { Popover } from "antd";
import { memo, useEffect, useRef, type ReactNode } from "react";
import { useAgentChatOperation } from "@/research/useAgentChatOperation";
import type { AgentChatOperation } from "@/research/useAgentChatOperation";
import ScreenshotAction from "./ScreenshotAction";
const emojis = [
  "🙂",
  "😊",
  "👍",
  "👏",
  "🙏",
  "🤝",
  "💡",
  "✅",
  "🎉",
  "❤️",
  "🤔",
  "👀",
  "📚",
  "📝",
  "🔬",
  "🌱",
];
const SendActionBar = ({
  insertEmoji,
  stageFiles,
  stageImages,
  pasteImages,
  wechatImport,
}: {
  insertEmoji: (emoji: string) => void;
  stageFiles: (files: File[]) => void;
  stageImages: (files: File[]) => void;
  pasteImages: () => void;
  wechatImport?: (button: ReactNode, chooseFiles: () => void) => ReactNode;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const intent = useRef<AgentChatOperation>();
  const capture = useAgentChatOperation();
  useEffect(() => () => intent.current?.dispose(), []);
  const chooseFiles = () => {
    intent.current?.dispose(); intent.current = capture(); input.current?.click();
  };
  const attachmentButton = <button type="button" className="chat-tool-button" aria-label="添加附件" title="添加图片、文件或微信分享包"
    onClick={wechatImport ? undefined : chooseFiles}><FolderOpenOutlined /></button>;
  return (
    <div className="px-3 pt-1">
      <div className="flex items-center gap-1" role="toolbar" aria-label="聊天工具栏">
        <Popover
          trigger="click"
          placement="topLeft"
          content={
            <div className="grid grid-cols-4 gap-1" aria-label="选择表情">
              {emojis.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  aria-label={`插入表情 ${emoji}`}
                  onClick={() => insertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          }
        >
          <button
            type="button"
            className="chat-tool-button"
            aria-label="表情"
            title="表情"
          >
            <SmileOutlined />
          </button>
        </Popover>
        {wechatImport ? wechatImport(attachmentButton, chooseFiles) : attachmentButton}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="选择聊天附件"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files || []);
            event.currentTarget.value = "";
            const operation = intent.current;
            intent.current = undefined;
            try {
              if (operation?.isCurrent()) stageFiles(files);
            } finally {
              operation?.dispose();
            }
          }}
        />
        <ScreenshotAction stageImages={stageImages} pasteImages={pasteImages} />
      </div>
    </div>
  );
};
export default memo(SendActionBar);
