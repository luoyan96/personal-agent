import { Alert, Button, Input, Modal, Space, Tag } from "antd";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SessionType } from "@openim/wasm-client-sdk";
import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import { useConversationToggle } from "@/hooks/useConversationToggle";
import OIMAvatar from "@/components/OIMAvatar";
import { useUserStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { MemoryPanel } from "./MemoryPanel";

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
  const { toSpecifiedConversation } = useConversationToggle();
  useEffect(() => {
    setEditing(false);
    setMemories(false);
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
      title="联系人资料"
      open={isOverlayOpen}
      onCancel={close}
      footer={null}
      destroyOnClose
      width={500}
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
              {contact.username && (
                <p className="text-xs text-slate-500">@{contact.username}</p>
              )}
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
              {contacts.find(
                (c) =>
                  c.contact.identity.kind === "human" &&
                  c.contact.identity.memberId ===
                    (contact.identity.kind === "human"
                      ? ""
                      : contact.identity.ownerMemberId),
              )?.contact.displayName || "对方的账号"}{" "}
              ·{" "}
              {contact.availability.status === "available"
                ? "模型可用"
                : "模型暂不可用"}
            </p>
          )}
          {editing ? (
            <div className="space-y-2">
              {(
                [
                  ["displayName", "名称"],
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
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
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
                        if (!entry) {
                          const canonical = await researchApi(
                            "createDirectConversation",
                            { body: { contactId: contact.id } },
                          );
                          if (!isCurrent()) return;
                          await researchApi("imSyncConversation", {
                            params: { id: canonical.data.id },
                            body: {},
                          });
                          if (!isCurrent()) return;
                          await useResearchStore.getState().refresh();
                        }
                        if (!isCurrent()) return;
                        const target = useResearchStore
                          .getState()
                          .contacts.find((c) => c.contact.id === contact.id);
                        if (!target)
                          throw new Error("聊天目标尚未准备完成，请稍后再试。");
                        await toSpecifiedConversation({
                          sourceID: target.userID,
                          sessionType: SessionType.Single,
                        });
                        if (isCurrent()) close();
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
                  <Button onClick={() => setMemories(!memories)}>记忆</Button>
                )}
              </Space>
            </>
          )}
          {memories && contact.allowedActions.includes("manage_private_memory") && (
            <MemoryPanel
              key={contact.id}
              scope="private_agent"
              scopeId={contact.id}
              canManage
            />
          )}
        </div>
      )}
    </Modal>
  );
});
