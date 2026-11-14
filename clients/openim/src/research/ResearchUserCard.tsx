import { AssistantPreferences } from "./AssistantPreferences";

import { Alert, Button, Dropdown, Input, Modal, Space, Tag } from "antd";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import OIMAvatar from "@/research/ResearchAvatar";
import { useUserStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { MemoryPanel } from "./MemoryPanel";
import { useResearchContactChat } from "./useResearchContactChat";
import { AgentConnectionPanel } from "./AgentConnectionPanel";
import { AcceptCatAccountNumber } from "./AcceptCatAccountNumber";
import { ContactCardShare } from "./ContactCardShare";
import { AgentRoleDocuments } from "./AgentRoleDocuments";
import { contactRoleProfile } from "./agent-role-documents";
import { ContactRemovalButton } from './useContactRemoval';

export const ResearchUserCard = forwardRef<
  OverlayVisibleHandle,
  { userID?: string; isSelf?: boolean; contactId?: string; onClose?: () => void }
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
  const assistant = Boolean(contact && contact.identity.kind !== "human");
  const ownerId = contact?.identity.kind === "personal_agent" ? contact.identity.ownerMemberId : undefined;
  const ownAssistant = Boolean(ownerId && ownerId === actor?.member.id);
  const ownerName = ownerId && !ownAssistant
    ? contacts.find(({ contact: member }) => member.identity.kind === "human" && member.identity.memberId === ownerId)?.contact.displayName
    : undefined;
  const [editing, setEditing] = useState(false);
  const [memories, setMemories] = useState(false);
  const [roleDetails, setRoleDetails] = useState(false);
  const [connection, setConnection] = useState(false);
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
    props.onClose?.();
  };
  const openChat = useResearchContactChat();
  useEffect(() => {
    setEditing(false);
    setMemories(false);
    setRoleDetails(false);
    setConnection(false);
    setFailure("");
    setBusy(false);
  }, [scope]);
  const edit = () => {
    if (!contact) return;
    setForm(contact.identity.kind !== "human" ? contactRoleProfile(contact) : {
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
      title={assistant ? (ownAssistant ? "我的助理" : "助理资料") : props.isSelf ? "我的资料" : "联系人资料"}
      open={isOverlayOpen}
      onCancel={close}
      footer={null}
      destroyOnClose
      centered
      width={assistant ? 480 : 500}
      styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
    >
      {(error || failure) && <Alert type="error" showIcon message={error || failure} />}
      {!entry && !props.contactId && (
        <Alert type="warning" message="当前联系人资料暂不可读取，请稍后重试。" />
      )}
      {contact && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <OIMAvatar contact={contact} text={contact.displayName} size={48} />
            <div className="flex-1">
              <strong>{contact.displayName}</strong>
              <div>
                {!assistant && <Tag>真人</Tag>}
                {ownerName && <small>{ownerName}的助理</small>}
              </div>
            </div>
            {assistant && !editing && (
              <Dropdown trigger={["click"]} menu={{
                items: [
                  { key: "details", label: "查看角色" },
                  ...(contact.allowedActions.includes("edit_profile") ? [{ key: "edit", label: "自定义角色" }] : []),
                ],
                onClick: ({ key }) => key === "edit" ? edit() : setRoleDetails(value => !value),
              }}>
                <Button type="text" aria-label="更多助理设置">•••</Button>
              </Dropdown>
            )}
          </div>
          {contact.identity.kind === "human" && <AcceptCatAccountNumber username={contact.username}
            isSelf={contact.identity.memberId === actor?.member.id} active={isOverlayOpen} />}
          {!assistant && <>
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
          </>}
          {contact?.agentRuntime && (
            <div className="text-sm text-slate-600">
              <strong>外部文字服务</strong>
              <p className="break-all">{contact.agentRuntime.serviceOrigin}</p>
              <p>仅发送本次授权的文字，费用由连接服务的账号承担。</p>
              <p>{contact.agentRuntime.verification === "passed" ? "最近连接测试通过" : contact.agentRuntime.verification === "failed" ? "最近连接测试失败" : "尚未测试连接"}</p>
              <p>{contact.agentRuntime.callerAllowed ? "当前账号可调用" : "请联系所属成员开通调用权限"}</p>
            </div>
          )}
          {editing ? (
            <div className="space-y-2">
              {(
                [
                    ["displayName", contact.identity.kind === "human" ? "昵称" : "名称"],
                  ["introduction", "介绍"],
                  ["capabilityDescription", contact.identity.kind === "human" ? "能力描述" : "职责与工作方法（work.md）"],
                  ["personality", contact.identity.kind === "human" ? "性格与偏好" : "角色、判断与交流（persona.md）"],
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
                    rows={key === "displayName" ? 1 : key === "introduction" ? 2 : 7}
                    placeholder={key === "personality" && contact.identity.kind !== "human" ? "例如：讨论方案时先给自己的判断；我卡住时先帮一个小步骤。可补一段希望它怎样接话的示例。" : undefined}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
              {contact.identity.kind !== "human" && <p className="text-xs text-slate-500">支持 Markdown。可以写遇到某种情况时如何判断、怎样接话，并补一个对话示例。私人交流纠正可在「私人记忆」查看、修改或撤回。工具和资料权限仍按实际配置。</p>}
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
              {assistant ? <>
                {contact.profile.introduction && <p>{contact.profile.introduction}</p>}
                {roleDetails && <AgentRoleDocuments contact={contact} />}
                {ownAssistant && !contact.agentRuntime && contact.allowedActions.includes("manage_private_memory") && <AssistantPreferences key={scope} contactId={contact.id} showPrivate={!memories} />}
              </> : <dl>
                {(
                  [
                    ["introduction", "介绍"],
                    ["capabilityDescription", "能力描述"],
                    ["personality", "性格与偏好"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="my-3">
                    <dt className="text-sm font-medium text-slate-600">{label}</dt>
                    <dd className="whitespace-pre-wrap text-sm leading-7">
                      {contact.profile[key] || "尚未填写"}
                    </dd>
                  </div>
                ))}
              </dl>}
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
                <ContactRemovalButton contact={contact} active={isOverlayOpen} onRemoved={close} />
                {!assistant && contact.allowedActions.includes("edit_profile") && (
                  <Button onClick={edit}>{contact.identity.kind === "human" ? "编辑资料" : "编辑角色"}</Button>
                )}
                {contact.allowedActions.includes("manage_private_memory") && (
                  <Button onClick={() => setMemories(!memories)}>{memories ? "收起专属记忆" : "管理助理专属记忆"}</Button>
                )}
                {contact.identity.kind === "personal_agent" && contact.profile.role === "specialist" && contact.identity.ownerMemberId === actor?.member.id && contact.allowedActions.includes('edit_profile') && <>
                  <Button onClick={() => setConnection(!connection)}>外部服务</Button>
                </>}
              </Space>
              <details className="assistant-share-disclosure"><summary>分享联系人名片</summary><ContactCardShare contact={contact} active={isOverlayOpen} /></details>

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
