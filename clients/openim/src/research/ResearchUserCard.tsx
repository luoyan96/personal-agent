import { Alert, Button, Input, Modal, Space, Tag } from "antd";
import { forwardRef, useEffect, useState } from "react";
import { SessionType } from "@openim/wasm-client-sdk";
import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import { useConversationToggle } from "@/hooks/useConversationToggle";
import OIMAvatar from "@/components/OIMAvatar";
import { useUserStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { MemoryPanel } from "./MemoryPanel";

export const ResearchUserCard = forwardRef<OverlayVisibleHandle, { userID?: string; isSelf?: boolean }>((props, ref) => {
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);
  const contacts = useResearchStore(s => s.contacts);
  const self = useUserStore(s => s.selfInfo.userID);
  const actor = useResearchStore(s => s.actor);
  const entry = contacts.find(c => props.isSelf ? c.contact.identity.kind === "human" && c.contact.identity.memberId === actor?.member.id : c.userID === props.userID);
  const contactId = entry?.contact.id || "";
  const { data, error, refresh } = useResearchRead(() => researchApi("chatContact", { params: { id: contactId } }), contactId, isOverlayOpen && !!contactId);
  const contact = data?.data;
  const [editing, setEditing] = useState(false);
  const [memories, setMemories] = useState(false);
  const [form, setForm] = useState({ displayName: "", introduction: "", capabilityDescription: "", personality: "" });
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const { toSpecifiedConversation } = useConversationToggle();
  useEffect(() => { setEditing(false); setMemories(false); setFailure(""); }, [contactId, isOverlayOpen]);
  const edit = () => { if (!contact) return; setForm({ displayName: contact.displayName, introduction: contact.profile.introduction, capabilityDescription: contact.profile.capabilityDescription, personality: contact.profile.personality }); setVersion(contact.profile.version); setEditing(true); };
  const command = async (run: () => Promise<unknown>) => { setBusy(true); setFailure(""); try { await run(); await useResearchStore.getState().refresh(); await refresh(); } catch (err) { setFailure(err instanceof Error ? err.message : "操作失败"); await refresh(); } finally { setBusy(false); } };
  return <Modal title="联系人资料" open={isOverlayOpen} onCancel={closeOverlay} footer={null} destroyOnClose width={500}>
    {(error || failure) && <Alert type="error" showIcon message={error || failure} />}
    {!entry && <Alert type="warning" message="当前身份未在实验室通讯录中，不能以 IM 资料授予科研权限。" />}
    {contact && <div className="space-y-4">
      <div className="flex gap-3 items-center"><OIMAvatar text={contact.displayName} size={48} /><div><strong>{contact.displayName}</strong><div><Tag>{contact.identity.kind === "human" ? "真人" : contact.profile.role === "coordinator" ? "AI · 需求协调" : "AI Agent"}</Tag></div></div></div>
      <p className="text-xs text-slate-600">关系：{{ own: "本人或我的 Agent", none: "尚未添加", pending_outbound: "等待对方同意", pending_inbound: "待你处理", accepted: "已添加", declined: "已拒绝", revoked: "关系已移除" }[contact.relationship.status]}</p>
      {contact.identity.kind !== "human" && <p className="text-xs text-slate-600">主人：{contacts.find(c => c.contact.identity.kind === "human" && c.contact.identity.memberId === (contact.identity.kind === "human" ? "" : contact.identity.ownerMemberId))?.contact.displayName || contact.identity.ownerMemberId} · {contact.availability.status === "available" ? "科研服务已配置" : "科研服务当前不可用"}</p>}
      {editing ? <div className="space-y-2">{([['displayName','名称'],['introduction','介绍'],['capabilityDescription','能力描述'],['personality','性格与偏好']] as const).map(([key,label]) => <label className="block" key={key}>{label}<Input.TextArea value={form[key]} maxLength={key === "displayName" ? 200 : key === "capabilityDescription" ? 4000 : 2000} rows={key === "displayName" ? 1 : 3} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}<Space><Button type="primary" loading={busy} disabled={!contact.allowedActions.includes("edit_profile")} onClick={() => void command(async () => { await researchApi("updateContactProfile", { params: { id: contact.id }, body: { ...form, expectedVersion: version } }); setEditing(false); })}>保存资料</Button><Button onClick={() => setEditing(false)}>取消</Button></Space></div> : <><dl>{([['introduction','介绍'],['capabilityDescription','能力描述'],['personality','性格与偏好']] as const).map(([key,label]) => <div key={key} className="my-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="whitespace-pre-wrap">{contact.profile[key] || "尚未填写"}</dd></div>)}</dl><Space wrap>
        {contact.allowedActions.includes("chat") && <Button type="primary" loading={busy} onClick={() => void command(async () => { await toSpecifiedConversation({ sourceID: entry!.userID, sessionType: SessionType.Single }); closeOverlay(); })}>发消息</Button>}
        {contact.allowedActions.includes("request") && <Button loading={busy} onClick={() => void command(() => researchApi("requestContact", { params: { id: contact.id }, body: {} }))}>添加联系人</Button>}
        {contact.allowedActions.includes("remove") && <Button danger onClick={() => Modal.confirm({ title: "移除关系？", content: "取消私聊关系，不自动撤销已有任务承接或群成员身份。", onOk: () => command(() => researchApi("revokeContact", { params: { id: contact.id }, body: { expectedVersion: contact.relationship.version } })) })}>移除关系</Button>}
        {contact.allowedActions.includes("edit_profile") && <Button onClick={edit}>编辑资料</Button>}
        {contact.allowedActions.includes("manage_private_memory") && <Button onClick={() => setMemories(!memories)}>记忆</Button>}
      </Space></>}
      {memories && contact.allowedActions.includes("manage_private_memory") && <MemoryPanel key={contact.id} scope="private_agent" scopeId={contact.id} canManage />}
    </div>}
  </Modal>;
});
