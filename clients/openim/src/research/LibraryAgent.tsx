import { Alert, Button, Modal, Select } from "antd";
import { MessageOutlined, ReadOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import type { Contact, ResponseFor } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { findOwnedStarter, libraryAgentStarter } from "./agentStarterProfiles";
import { prepareLibraryAgent, type LibraryAgentBindings } from "./library-agent";
import { researchScopeLabels } from "./research-library-api";
import { useResearchStore } from "./store";
import { useAgentStarterLinks } from "./useAgentStarterLinks";
import { useAgentChatOperation } from "./useAgentChatOperation";
import { useResearchContactChat } from "./useResearchContactChat";

export function LibraryAgent() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="library-agent-entry" aria-label="资料 Agent">
        <div className="library-agent-icon">
          <ReadOutlined />
        </div>
        <div className="library-agent-intro">
          <h3>资料 Agent</h3>
          <p>找一份申请书，读懂一篇论文，整理一组参考资料。选好资料，直接聊。</p>
        </div>
        <Button type="primary" icon={<MessageOutlined />} onClick={() => setOpen(true)}>
          与资料 Agent 对话
        </Button>
      </section>
      {open && <LibraryAgentDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function LibraryAgentDialog({ onClose }: { onClose: () => void }) {
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const { links, remember } = useAgentStarterLinks(actorId);
  const capture = useAgentChatOperation();
  const openChat = useResearchContactChat();
  const [agent, setAgent] = useState<Contact>();
  const [bindings, setBindings] = useState<LibraryAgentBindings>();
  const [collections, setCollections] = useState<
    ResponseFor<"researchCollections">["data"]
  >([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  // The dialog is intentionally read on entry/retry, not polled over an edited draft.
  const initialRememberedId = useRef(links[libraryAgentStarter.id]);
  useEffect(() => {
    const operation = capture();
    setReady(false);
    setFailure("");
    void (async () => {
      try {
        const [owned, visible] = await Promise.all([
          researchApi("chatContacts", {
            query: { view: "mine", scope: "local", limit: 100 },
            signal: operation.signal,
          }),
          researchApi("researchCollections", {
            query: { scope: "visible", limit: 100 },
            signal: operation.signal,
          }),
        ]);
        if (!operation.isCurrent()) return;
        const found = findOwnedStarter(
          owned.data,
          libraryAgentStarter,
          actorId || "",
          initialRememberedId.current,
        );
        if (found?.agentRuntime)
          throw new Error("资料 Agent 已改为外部服务，请从我的 Agent 核对配置。");
        const current = found
          ? (
              await researchApi("agentResearchCollections", {
                params: { id: found.id },
                signal: operation.signal,
              })
            ).data
          : undefined;
        if (!operation.isCurrent()) return;
        setAgent(found);
        setBindings(current);
        // Keep bound collections outside the first 100 visible results in the selector.
        setCollections([
          ...new Map(
            [...visible.data, ...(current?.collections || [])].map((c) => [c.id, c]),
          ).values(),
        ]);
        setSelected(current?.collectionIds || []);
        setReady(true);
      } catch (error) {
        if (operation.isCurrent())
          setFailure(error instanceof Error ? error.message : "读取失败，请重试。");
      } finally {
        operation.dispose();
      }
    })();
    return operation.dispose;
    // capture is an event-style operation factory; reads belong to this entry/retry.
  }, [actorId, reload]);
  const start = async () => {
    if (!ready || !actorId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    const operation = capture();
    try {
      const prepared = await prepareLibraryAgent({
        api: researchApi,
        actorId,
        rememberedId: initialRememberedId.current,
        agent,
        bindings,
        collectionIds: selected,
        signal: operation.signal,
        isCurrent: operation.isCurrent,
        onPrepared: (contact, current) => {
          setAgent(contact);
          setBindings(current);
          initialRememberedId.current = contact.id;
          remember(libraryAgentStarter.id, contact.id);
        },
      });
      if (!prepared || !operation.isCurrent()) return;
      await openChat(prepared.agent.id, operation.isCurrent, {
        requireOwnLocal: true,
        onTarget: operation.allowTarget,
      });
      if (operation.isCurrent()) onClose();
    } catch (error) {
      if (operation.isCurrent())
        setFailure(error instanceof Error ? error.message : "操作未完成，请重试。");
    } finally {
      if (operation.isCurrent()) setBusy(false);
      lock.current = false;
      operation.dispose();
    }
  };
  return (
    <Modal
      title="资料 Agent"
      open
      onCancel={() => !busy && onClose()}
      closable={!busy}
      maskClosable={!busy}
      footer={null}
      width={620}
    >
      <div className="library-agent-setup">
        <p>
          这是你自己的资料助手，使用你的模型设置。每次提问，从选定集合中检索获准的文字片段，并提供可核对的来源。
        </p>
        <label>
          <strong>它可以使用哪些资料？</strong>
          <Select
            aria-label="资料 Agent 使用的集合"
            mode="multiple"
            value={selected}
            disabled={!ready || busy}
            placeholder="选择资料集合（最多 20 个）"
            onChange={(values) => {
              if (values.length <= 20) setSelected(values);
            }}
            options={collections
              .filter((c) => c.status === "available")
              .map((c) => ({
                value: c.id,
                label: `${c.name} · ${researchScopeLabels[c.scope]}`,
                disabled: selected.length >= 20 && !selected.includes(c.id),
              }))}
            optionFilterProp="label"
          />
        </label>
        {!ready && !failure && <p role="status">正在读取资料与 Agent 配置…</p>}
        {ready && !collections.length && (
          <p className="library-agent-hint">
            还没有可用集合。可以先返回新建或连接飞书资料，也可先开始聊天、主动上传文字附件。
          </p>
        )}
        {collections.length >= 100 && (
          <p className="library-agent-hint">
            当前选择器显示最近 100 个获准集合，并保留已绑定集合。
          </p>
        )}
        <div className="library-agent-examples">
          <strong>可以这样问</strong>
          <p>“总结这些资料里的项目申报经验”</p>
          <p>“查找申请书中关于研究基础的内容，标明出处”</p>
          <p>“对比这两篇论文的方法和局限”</p>
        </div>
        <p className="library-agent-hint">
          {agent
            ? `将复用「${agent.displayName}」，保存所选资料范围。`
            : "确认后创建你的资料 Agent 并保存所选范围。"}{" "}
          不自动发送消息。选择集合不会改变它的共享范围；仅保存原件的
          PPT、图片和代码需打开原件查看，飞书副本不自动同步。
        </p>
        {failure && (
          <Alert
            type="warning"
            showIcon
            message={failure}
            action={
              <Button disabled={busy} onClick={() => setReload((n) => n + 1)}>
                重新读取
              </Button>
            }
          />
        )}
        <div className="library-agent-footer">
          <Button disabled={busy} onClick={onClose}>
            返回资料
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!ready}
            onClick={() => void start()}
          >
            {agent ? "保存范围并开始聊天" : "创建并开始聊天"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
