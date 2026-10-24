import { Alert, Button, Input, Modal, Space, Tag } from "antd";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import OIMAvatar from "@/components/OIMAvatar";
import { useUserStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { MemoryPanel } from "./MemoryPanel";
import { useResearchContactChat } from "./useResearchContactChat";
import { AgentConnectionPanel } from "./AgentConnectionPanel";
import { AcceptCatAccountNumber } from "./AcceptCatAccountNumber";
import { ContactCardShare } from "./ContactCardShare";

export const ResearchUserCard = forwardRef<
  OverlayVisibleHandle,
  { userID?: string; isSelf?: boolean; contactId?: string }
>((props, ref) => {
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);
  const contacts = useResearchStore((s) => s.contacts);
  const self = useUserStore((s) => s.selfInfo.userID);
  const actor = useResearchStore((s) => s.actor);
  const generation = useResearchStore((s) => s.generation);
  const entry = contacts.find((c) =>
    props.isSelf
      ? c.contact.identity.kind === "human" &&
        c.contact.identity.memberId === actor?.member.id
      : c.userID === props.userID,
  );
  const contactId = props.contactId || entry?.contact.id || "";
  const { data, error, refresh } = useResearchRead(
    () => researchApi("chatContact", { params: { id: contactId } }),
    contactId,
    isOverlayOpen && !!contactId,
  );
  const contact = data?.data;
  const [editing, setEditing] = useState(false);
  const [memories, setMemories] = useState(false);
  const [connection, setConnection] = useState(false), [exported, setExported] = useState("");
  const [form, setForm] = useState({
    displayName: "",
    introduction: "",
    capabilityDescription: "",
    personality: "",
  });
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const epoch = useRef(0);
  const currentScope = useRef("");
  const scope = `${generation}:${actor?.member.id}:${contactId}:${isOverlayOpen}`;
  currentScope.current = scope;
  useLayoutEffect(() => {
    epoch.current++;
    return () => {
      epoch.current++;
    };
  }, [scope]);
  const close = () => {
    epoch.current++;
    closeOverlay();
  };
  const openChat = useResearchContactChat();
  useEffect(() => {
    setEditing(false);
    setMemories(false);
    setConnection(false); setExported("");
    setFailure("");
    setBusy(false);
  }, [scope]);
  const edit = () => {
    if (!contact) return;
    setForm({
      displayName: contact.displayName,
      introduction: contact.profile.introduction,
      capabilityDescription: contact.profile.capabilityDescription,
      personality: contact.profile.personality,
    });
    setVersion(contact.profile.version);
    setEditing(true);
  };
  const command = async (run: (isCurrent: () => boolean) => Promise<unknown>) => {
    const requestEpoch = epoch.current;
    const isCurrent = () =>
      isOverlayOpen &&
      epoch.current === requestEpoch &&
      currentScope.current === scope &&
      useResearchStore.getState().generation === generation &&
      useResearchStore.getState().actor?.member.id === actor?.member.id;
    if (!isCurrent()) return;
    setBusy(true);
    setFailure("");
    try {
      await run(isCurrent);
      if (!isCurrent()) return;
      await useResearchStore.getState().refresh();
      if (!isCurrent()) return;
      await refresh();
    } catch (err) {
      if (isCurrent()) {
        setFailure(err instanceof Error ? err.message : "操作失败");
        await refresh();
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <Modal
      title={props.isSelf ? "我的资料" : "联系人资料"}
      open={isOverlayOpen}
      onCancel={close}
      footer={null}
      destroyOnClose
      centered
      width={500}
      styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
    >
      {(error || failure) && <Alert type="error" showIcon message={error || failure} />}
      {!entry && !props.contactId && (
        <Alert type="warning" message="当前联系人资料暂不可读取，请稍后重试。" />
      )}
      {contact && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <OIMAvatar text={contact.displayName} size={48} />
            <div>
              <strong>{contact.displayName}</strong>
              <div>
                <Tag>
                  {contact.identity.kind === "human"
                    ? "真人"
                    : contact.profile.role === "coordinator" &&
                      contact.identity.ownerMemberId === actor?.member.id
                    ? "你的 AI 联系人"
                    : "AI Agent"}
                </Tag>
              </div>
            </div>
          </div>
          {contact.identity.kind === "human" && <AcceptCatAccountNumber username={contact.username}
            isSelf={contact.identity.memberId === actor?.member.id} active={isOverlayOpen} />}
          <p className="text-xs text-slate-600">
            关系：
            {
              {
                own: "本人或我的 Agent",
                none: "尚未添加",
                pending_outbound: "等待对方同意",
                pending_inbound: "待你处理",
                accepted: "已添加",
                declined: "已拒绝",
                revoked: "关系已移除",
              }[contact.relationship.status]
            }
          </p>
          {contact.identity.kind !== "human" && (
            <p className="text-xs text-slate-600">
              主人：
              {contact.identity.ownerMemberId === actor?.member.id ? actor.member.displayName : contacts.find(
                (c) =>
                  c.contact.identity.kind === "human" &&
                  c.contact.identity.memberId ===
                    (contact.identity.kind === "human"
                      ? ""
                      : contact.identity.ownerMemberId),
              )?.contact.displayName || "此 Agent 的所属账号"}
            </p>
          )}
          {contact.identity.kind !== "human" && <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            {contact.agentRuntime ? <><strong>外部文字服务</strong><p className="break-all">{contact.agentRuntime.serviceOrigin}</p><p>仅发送逐条授权的当前文字；费用由主人连接的外部账号承担。{contact.agentRuntime.callerAllowed ? "当前账号获准调用。" : "当前账号不能调用，请联系主人。"}</p><p>连接验证：{contact.agentRuntime.verification === "passed" ? "最近测试通过" : contact.agentRuntime.verification === "failed" ? "最近测试失败" : "尚未确认可用"}。本站的记忆、附件与协作不会转发；远端自身功能以该服务为准，本站不作验证。</p></> : <><strong>平台 Agent</strong><p>使用发送者的模型设置和获准记忆。能力描述是交流人设，不代表已配置联网、执行工具或已验证研究结果。</p></>}
          </div>}
          {editing ? (
            <div className="space-y-2">
              {(
                [
                    ["displayName", contact.identity.kind === "human" ? "昵称" : "名称"],
                  ["introduction", "介绍"],
                  ["capabilityDescription", "能力描述"],
                  ["personality", "性格与偏好"],
                ] as const
              ).map(([key, label]) => (
                <label className="block" key={key}>
                  {label}
                  <Input.TextArea
                    value={form[key]}
                    maxLength={
                      key === "displayName"
                        ? 200
                        : key === "capabilityDescription"
                        ? 4000
                        : 2000
                    }
                    rows={key === "displayName" ? 1 : 3}
                    placeholder={key === "personality" && contact.identity.kind !== "human" ? "例如：讨论方案时先给自己的判断；我卡住时先帮一个小步骤。可补一段希望它怎样接话的示例。" : undefined}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
              {contact.identity.kind !== "human" && <p className="text-xs text-slate-500">这里是角色档案。只想让它记住与你的相处偏好，可以使用私人记忆。</p>}
              <Space>
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!contact.allowedActions.includes("edit_profile")}
                  onClick={() =>
                    void command(async (isCurrent) => {
                      await researchApi("updateContactProfile", {
                        params: { id: contact.id },
                        body: { ...form, expectedVersion: version },
                      });
                      if (isCurrent()) setEditing(false);
                    })
                  }
                >
                  保存资料
                </Button>
                <Button onClick={() => setEditing(false)}>取消</Button>
              </Space>
            </div>
          ) : (
            <>
              <dl>
                {(
                  [
                    ["introduction", "介绍"],
                    ["capabilityDescription", "能力描述"],
                    ["personality", "性格与偏好"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="my-3">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="whitespace-pre-wrap">
                      {contact.profile[key] || "尚未填写"}
                    </dd>
                  </div>
                ))}
              </dl>
              <Space wrap>
                {contact.allowedActions.includes("chat") && (
                  <Button
                    type="primary"
                    loading={busy}
                    onClick={() =>
                      void command(async (isCurrent) => {
                        if (await openChat(contact.id, isCurrent)) {
                          if (isCurrent()) close();
                        }
                      })
                    }
                  >
                    发消息
                  </Button>
                )}
                {contact.allowedActions.includes("request") && (
                  <Button
                    loading={busy}
                    onClick={() =>
                      void command(() =>
                        researchApi("requestContact", {
                          params: { id: contact.id },
                          body: {},
                        }),
                      )
                    }
                  >
                    添加联系人
                  </Button>
                )}
                {contact.allowedActions.includes("remove") && (
                  <Button
                    danger
                    onClick={() =>
                      Modal.confirm({
                        title: "移除关系？",
                        content: "取消私聊关系，不自动撤销已有任务承接或群成员身份。",
                        onOk: () =>
                          command(() =>
                            researchApi("revokeContact", {
                              params: { id: contact.id },
                              body: { expectedVersion: contact.relationship.version },
                            }),
                          ),
                      })
                    }
                  >
                    移除关系
                  </Button>
                )}
                {contact.allowedActions.includes("edit_profile") && (
                  <Button onClick={edit}>编辑资料</Button>
                )}
                {contact.allowedActions.includes("manage_private_memory") && (
                  <Button onClick={() => setMemories(!memories)}>私人记忆</Button>
                )}
                {contact.identity.kind === "personal_agent" && contact.profile.role === "specialist" && contact.identity.ownerMemberId === actor?.member.id && <>
                  <Button onClick={() => setConnection(!connection)}>外部服务</Button>
                  <Button loading={busy} onClick={() => void command(async isCurrent => {
                    const result = await researchApi("exportAgentProfile", { params: { id: contact.id } });
                    if (isCurrent()) setExported(JSON.stringify(result.data, null, 2));
                  })}>导出人设资料</Button>
                </>}
              </Space>
              <ContactCardShare contact={contact} active={isOverlayOpen} />
              {exported && <div className="space-y-2"><p className="text-xs text-slate-600">只包含公开人设四项资料。导入会创建或复用对方自己的 Agent，不转移此联系人的身份或外部连接。</p><Input.TextArea aria-label="导出的人设 JSON" readOnly rows={6} value={exported} onFocus={e => e.target.select()} /><Button onClick={() => {
                const url = URL.createObjectURL(new Blob([exported], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "agent-profile.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}>保存资料 JSON</Button></div>}
            </>
          )}
          {memories && contact.allowedActions.includes("manage_private_memory") && (
            <MemoryPanel
              key={contact.id}
              scope="private_agent"
              scopeId={contact.id}
              canManage
              styleChatAvailable={!contact.agentRuntime}
            />
          )}
          {connection && contact.identity.kind === "personal_agent" && contact.profile.role === "specialist" && contact.identity.ownerMemberId === actor?.member.id && <AgentConnectionPanel key={`${contact.id}:${generation}`} active={isOverlayOpen} contactId={contact.id} onChanged={refresh} />}
        </div>
      )}
    </Modal>
  );
});
