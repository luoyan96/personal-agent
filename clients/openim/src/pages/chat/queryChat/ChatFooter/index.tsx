import { useLatest } from "ahooks";
import { Button } from "antd";
import { t } from "i18next";
import { memo, useEffect, useRef, useState } from "react";
import type { MessageItem } from "@openim/wasm-client-sdk";
import { useResearchComposer } from "@/research/ResearchComposer";
import { useResearchStore } from "@/research/store";

import CKEditor from "@/components/CKEditor";
import { getCleanText } from "@/components/CKEditor/utils";
import i18n from "@/i18n";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { feedbackToast } from "@/utils/common";

import SendActionBar from "./SendActionBar";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";

const sendActions = [
  { label: t("placeholder.sendWithEnter"), key: "enter" },
  { label: t("placeholder.sendWithShiftEnter"), key: "enterwithshift" },
];

i18n.on("languageChanged", () => {
  sendActions[0].label = t("placeholder.sendWithEnter");
  sendActions[1].label = t("placeholder.sendWithShiftEnter");
});

const ChatFooter = () => {
  const imID = useConversationStore(s => s.currentConversation?.conversationID || "");
  const actor = useResearchStore(s => s.actor?.member.id);
  const drafts = useRef(new Map<string,string>());
  const [html, setHtml] = useState("");
  const latestHtml = useLatest(html);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const retry = useRef<{key:string;message:MessageItem}>();
  const composer = useResearchComposer();
  useEffect(() => { setHtml(drafts.current.get(imID) || ""); retry.current = undefined; }, [imID]);
  useEffect(() => { drafts.current.clear(); setHtml(""); retry.current = undefined; }, [actor]);

  const { getImageMessage, getFileMessage, getSoundMessage } = useFileMessage();
  const { sendMessage } = useSendMessage();

  const onChange = (value: string) => {
    drafts.current.set(imID,value);
    setHtml(value);
  };

  const enterToSend = async () => {
    if (busy.current) return;
    const cleanText = getCleanText(latestHtml.current);
    if (!cleanText) return;
    const conversation = useConversationStore.getState().currentConversation;
    if (!conversation) return;
    const original = latestHtml.current;
    busy.current = true; setPending(true);
    try {
      if (!(await composer.sendResearch(cleanText))) {
        const key = JSON.stringify([conversation.conversationID,cleanText]);
        const message = retry.current?.key === key ? retry.current.message : (await IMSDK.createTextMessage(cleanText)).data;
        retry.current = {key,message};
        await sendMessage({ message, recvID: conversation.userID, groupID: conversation.groupID });
        retry.current = undefined;
      }
      if (drafts.current.get(conversation.conversationID) === original) drafts.current.delete(conversation.conversationID);
      if (latestHtml.current === original && useConversationStore.getState().currentConversation?.conversationID === conversation.conversationID) setHtml("");
    } catch (error) { feedbackToast({ error, msg: "发送失败，输入已保留" }); }
    finally { busy.current = false; setPending(false); }
  };

  const droppedFiles = async (files: File[]) => {
    const conversation = useConversationStore.getState().currentConversation;
    if (!conversation) return;
    for (const file of files) try {
      const message = await (file.type.startsWith("image/") ? getImageMessage(file) : getFileMessage(file));
      await sendMessage({ message, recvID: conversation.userID, groupID: conversation.groupID });
    } catch (error) { feedbackToast({ error, msg: `文件 ${file.name} 发送失败` }); }
  };

  return (
    <footer className="relative h-full bg-white py-px" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDropCapture={event => { if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); void droppedFiles(Array.from(event.dataTransfer.files)); } }}>
      <div className="flex h-full flex-col border-t border-t-[var(--gap-text)]">
        <SendActionBar sendMessage={sendMessage} getImageMessage={getImageMessage} getFileMessage={getFileMessage} getSoundMessage={getSoundMessage} />
        {composer.controls}
        {composer.isCoordinator && !getCleanText(html) && <div className="px-3 py-1 text-xs flex gap-2 flex-wrap">{["文献梳理", "数据分析", "论文修改"].map(label => <Button size="small" key={label} disabled={pending} onClick={() => { if (!getCleanText(latestHtml.current)) onChange(`我想完成${label}。请先向我确认目标、已有材料、交付形式与验收要求，再提出协作安排。`); }}>{label}</Button>)}</div>}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <CKEditor
            key={imID}
            value={html}
            placeholder={composer.isCoordinator ? "告诉你的需求协调 Agent，你想完成什么…" : "发送消息…"}
            onEnter={() => void enterToSend()}
            onChange={onChange}
          />
          <div className="flex items-center justify-end py-2 pr-3">
            <Button
              className="w-fit px-6 py-1"
              type="primary"
              loading={pending}
              disabled={!getCleanText(html) || composer.invalid}
              onClick={() => void enterToSend()}
            >
              {t("placeholder.send")}
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(ChatFooter);
