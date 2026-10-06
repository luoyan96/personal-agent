import { Alert, Button, Modal } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  agentStarters,
  findOwnedStarter,
  type AgentStarter,
} from "./agentStarterProfiles";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { useResearchContactChat } from "./useResearchContactChat";

export function AgentStarters({ onChanged, active = true }: { onChanged: () => Promise<void>; active?: boolean }) {
  const actorId = useResearchStore((state) => state.actor?.member.id);
  const generation = useResearchStore((state) => state.generation);
  const location = useLocation();
  const scope = `${generation}:${actorId}:${location.pathname}:${active}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const epoch = useRef(0);
  const saved = useRef<Record<string, string>>({});
  const { data, error, refresh } = useResearchRead(
    () =>
      researchApi("chatContacts", {
        query: { view: "mine", scope: "local", limit: 100 },
      }),
    "agent-starters",
  );
  const [selected, setSelected] = useState<AgentStarter>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [savedId, setSavedId] = useState<string>();
  const openChat = useResearchContactChat();
  useLayoutEffect(() => {
    epoch.current++;
    saved.current = {};
    setSelected(undefined);
    setBusy(false);
    setFailure("");
    setSavedId(undefined);
    return () => {
      epoch.current++;
    };
  }, [scope]);
  const choose = (starter: AgentStarter) => {
    epoch.current++;
    setFailure("");
    setBusy(false);
    setSavedId(
      saved.current[starter.id] ||
        findOwnedStarter(data?.data || [], starter, actorId || "")?.id,
    );
    setSelected(starter);
  };
  const close = () => {
    if (busy) return;
    epoch.current++;
    setSelected(undefined);
  };
  const confirm = async () => {
    if (!selected || !actorId || busy) return;
    const requestEpoch = epoch.current;
    const isCurrent = () =>
      epoch.current === requestEpoch &&
      currentScope.current === scope &&
      useResearchStore.getState().generation === generation &&
      useResearchStore.getState().actor?.member.id === actorId;
    setBusy(true);
    setFailure("");
    try {
      // Re-read owned contacts before creating; a failed open never creates again.
      const owned = await researchApi("chatContacts", {
        query: { view: "mine", scope: "local", limit: 100 },
      });
      if (!isCurrent()) return;
      let contactId =
        saved.current[selected.id] ||
        findOwnedStarter(owned.data, selected, actorId)?.id;
      if (!contactId) {
        const created = await researchApi("createPersonalAgent", {
          body: selected.profile,
        });
        if (!isCurrent()) return;
        contactId = created.data.id;
      }
      saved.current[selected.id] = contactId;
      setSavedId(contactId);
      await refresh();
      if (!isCurrent()) return;
      await onChanged();
      if (!isCurrent()) return;
      if (await openChat(contactId, isCurrent)) {
        if (isCurrent()) setSelected(undefined);
      }
    } catch (error) {
      if (isCurrent())
        setFailure(error instanceof Error ? error.message : "操作未完成，请稍后重试。");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <section
      aria-label="添加 Agent"
      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
    >
      <h3 className="mb-1 text-sm font-semibold">添加 Agent</h3>
      <p className="mb-4 text-xs leading-5 text-slate-600">
        选择一个助手，添加为你自己的联系人。使用你的模型设置，资料与记忆可继续编辑。
      </p>
      {error && <Alert className="mb-3" type="warning" message={error} />}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {agentStarters.map((starter) => {
          const existing =
            saved.current[starter.id] ||
            findOwnedStarter(data?.data || [], starter, actorId || "")?.id;
          return (
            <article
              key={starter.id}
              className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-4"
              aria-label={starter.profile.displayName}
            >
              <span className="mb-2 text-xs font-medium text-[#0089ff]">AI Agent</span>
              <h4 className="text-sm font-semibold">{starter.profile.displayName}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-700">{starter.summary}</p>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                <strong>适用输入：</strong>
                {starter.input}
              </p>
              <p className="mb-4 mt-2 text-xs leading-5 text-slate-600">
                <strong>能力边界：</strong>
                {starter.boundary}
              </p>
              <Button
                className="mt-auto self-start"
                type={existing ? "default" : "primary"}
                disabled={!data || !actorId}
                onClick={() => choose(starter)}
              >
                {existing ? "开始聊天" : "添加并开始聊天"}
              </Button>
            </article>
          );
        })}
      </div>
      <Modal
        title={selected?.profile.displayName}
        open={!!selected}
        onCancel={close}
        closable={!busy}
        maskClosable={!busy}
        footer={null}
        width={540}
      >
        {selected && (
          <div className="space-y-4">
            <p>{selected.profile.introduction}</p>
            <dl className="space-y-3 text-sm leading-6">
              <div>
                <dt className="font-medium">适用输入</dt>
                <dd>{selected.input}</dd>
              </div>
              <div>
                <dt className="font-medium">能力与边界</dt>
                <dd>{selected.profile.capabilityDescription}</dd>
              </div>
              <div>
                <dt className="font-medium">性格与偏好</dt>
                <dd>{selected.profile.personality}</dd>
              </div>
            </dl>
            <p className="text-xs leading-5 text-slate-600">
              {savedId
                ? "已是你的 Agent，将打开已有私聊。"
                : "确认后保存为你拥有的 Agent，并打开私聊。"}
              不会自动发送消息；回复使用你的模型设置，未配置模型时需先设置。
            </p>
            {failure && (
              <Alert
                type={savedId ? "warning" : "error"}
                showIcon
                message={savedId ? "Agent 已添加，聊天暂未打开" : "操作未完成"}
                description={failure}
              />
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={busy} onClick={close}>
                取消
              </Button>
              <Button type="primary" loading={busy} onClick={() => void confirm()}>
                {savedId ? "开始聊天" : "添加并开始聊天"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
