import { MessageOutlined } from "@ant-design/icons";
import { Alert, Button, Radio } from "antd";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { useLayoutEffect, useRef, useState } from "react";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchContactChat } from "./useResearchContactChat";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import "./agent-consultation.scss";

type Consultation = ResponseFor<"agentConsultation">["data"];
type Mode = Consultation["mode"];

export async function readAgentConsultation(contactId: string, signal?: AbortSignal) {
  const { data } = await researchApi("agentConsultation", {
    params: { id: contactId },
    signal,
  });
  if (data.contactId !== contactId)
    throw new Error("咨询设置与当前助理不一致，请重新读取。");
  return data;
}

export function AgentConsultation({
  contactId,
  active = true,
  onChatOpened,
}: {
  contactId: string;
  active?: boolean;
  onChatOpened?: () => void;
}) {
  const generation = useResearchStore((state) => state.generation);
  return active ? (
    <ConsultationPanel
      key={`${generation}:${contactId}`}
      contactId={contactId}
      onChatOpened={onChatOpened}
    />
  ) : null;
}

function ConsultationPanel({
  contactId,
  onChatOpened,
}: {
  contactId: string;
  onChatOpened?: () => void;
}) {
  const read = useResearchRead(
    (signal) => readAgentConsultation(contactId, signal),
    `agent-consultation:${contactId}`,
    true,
    { poll: (value) => !value?.canEdit },
  );
  const operation = usePersonalOperation(true, `agent-consultation:${contactId}`);
  const openChat = useResearchContactChat();
  const pending = useRef<symbol>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<Mode>();
  const consultation = read.data;
  useLayoutEffect(() => {
    pending.current = undefined;
    setBusy(false);
    setFailure("");
    setSaved(false);
    setDraft(undefined);
  }, [operation.scope]);

  async function run(action: (isCurrent: () => boolean) => Promise<void>) {
    const { isCurrent } = operation.capture();
    if (!isCurrent() || pending.current) return;
    const ticket = Symbol();
    pending.current = ticket;
    setBusy(true);
    setFailure("");
    setSaved(false);
    try {
      await action(isCurrent);
    } catch (error) {
      if (isCurrent()) {
        setFailure(error instanceof Error ? error.message : "操作未完成，请稍后重试。");
        await read.refresh();
      }
    } finally {
      if (pending.current === ticket) {
        pending.current = undefined;
        if (isCurrent()) setBusy(false);
      }
    }
  }

  if (!consultation) {
    return read.error ? (
      <Alert
        className="agent-consultation-feedback"
        type="warning"
        message={read.error}
        action={
          <Button size="small" onClick={read.refresh}>
            重试读取
          </Button>
        }
      />
    ) : (
      <p role="status" className="agent-consultation-status">
        正在读取咨询设置…
      </p>
    );
  }

  const mode = draft ?? consultation.mode;
  const feedback = failure && (
    <Alert className="agent-consultation-feedback" type="error" message={failure} />
  );
  if (!consultation.canEdit) {
    return (
      <section className="agent-consultation" aria-label="助理咨询">
        {consultation.mode === "free" && consultation.canChat ? (
          <>
            <Button
              type="primary"
              icon={<MessageOutlined aria-hidden="true" />}
              loading={busy}
              onClick={() =>
                void run(async (isCurrent) => {
                  if (await openChat(contactId, isCurrent)) onChatOpened?.();
                })
              }
            >
              开始聊天
            </Button>
            <p>免费联系。对话使用你自己的模型 API，模型调用费用由你承担。</p>
          </>
        ) : (
          <p role="status">这位助理暂不开放咨询。</p>
        )}
        {feedback}
      </section>
    );
  }

  return (
    <form
      className="agent-consultation agent-consultation-settings"
      aria-label="咨询设置"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === consultation.mode) return;
        void run(async (isCurrent) => {
          const { data } = await researchApi("updateAgentConsultation", {
            params: { id: contactId },
            body: { expectedVersion: consultation.version, mode },
          });
          if (!isCurrent()) return;
          if (data.contactId !== contactId || data.mode !== mode)
            throw new Error("未能确认咨询设置已保存，请重新读取。");
          setDraft(undefined);
          setSaved(true);
          await read.refresh();
        });
      }}
    >
      <fieldset disabled={busy}>
        <legend>咨询设置</legend>
        <Radio.Group
          aria-label="助理开放方式"
          value={mode}
          onChange={(event) => {
            setDraft(event.target.value);
            setSaved(false);
            setFailure("");
          }}
        >
          <Radio value="closed">暂不开放</Radio>
          <Radio value="free">免费联系</Radio>
        </Radio.Group>
      </fieldset>
      {mode === "free" && (
        <p>其他人可以直接联系这位助理。模型调用使用对方的 API，费用由对方承担。</p>
      )}
      <Button
        type="primary"
        htmlType="submit"
        disabled={mode === consultation.mode}
        loading={busy}
      >
        保存咨询设置
      </Button>
      {feedback}
      {saved && <p role="status">咨询设置已保存。</p>}
    </form>
  );
}
