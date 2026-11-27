import { FolderOpenOutlined } from "@ant-design/icons";
import { memo, useEffect, useRef } from "react";
import { useAgentChatOperation } from "@/research/useAgentChatOperation";
import type { AgentChatOperation } from "@/research/useAgentChatOperation";
import ScreenshotAction from "./ScreenshotAction";
import StickerPicker from "./StickerPicker";

const SendActionBar = ({
  insertEmoji,
  textOnly = false,
  sendSticker,
  stageFiles,
  stageImages,
  pasteImages,
}: {
  insertEmoji: (emoji: string) => void;
  textOnly?: boolean;
  sendSticker: (id: string, label: string) => void;
  stageFiles: (files: File[]) => void;
  stageImages: (files: File[]) => void;
  pasteImages: () => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const intent = useRef<AgentChatOperation>();
  const capture = useAgentChatOperation();
  useEffect(() => () => intent.current?.dispose(), []);
  return (
    <div className="px-3 pt-1">
      <div className="flex items-center gap-1" role="toolbar" aria-label="聊天工具栏">
        <StickerPicker insertEmoji={insertEmoji} sendSticker={sendSticker} />
        {!textOnly && (
          <>
            <button
              type="button"
              className="chat-tool-button"
              aria-label="添加附件"
              title="添加图片或文件"
              onClick={() => {
                intent.current?.dispose();
                intent.current = capture();
                input.current?.click();
              }}
            >
              <FolderOpenOutlined />
            </button>
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
          </>
        )}
      </div>
    </div>
  );
};
export default memo(SendActionBar);
