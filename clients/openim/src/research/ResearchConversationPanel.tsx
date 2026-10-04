import { Alert, Button, Modal, Space, Tag } from "antd";
import { useEffect, useState } from "react";
import { useConversationStore } from "@/store";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { researchApi } from "./api";
import { MemoryPanel } from "./MemoryPanel";
import { ResearchTaskPanel } from "./ResearchTaskPanel";
import { ResearchActionCard } from "./ResearchActionCard";

export function ResearchConversationPanel() {
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  const mapping = useResearchStore((s) =>
    s.mappings.find((m) => m.imConversationID === imID),
  );
  const [open, setOpen] = useState(false),
    [taskId, setTaskId] = useState("");
  useEffect(() => {
    setOpen(false);
    setTaskId("");
  }, [imID]);
  const conversation = useResearchRead(
    () =>
      researchApi("chatConversation", {
        params: { id: mapping?.researchConversationId || "" },
      }),
    mapping?.researchConversationId || "",
    !!mapping,
  );
  const actions = useResearchRead(
    () =>
      researchApi("chatActions", {
        params: { id: mapping?.researchConversationId || "" },
        query: { limit: 100 },
      }),
    mapping?.researchConversationId || "",
    !!mapping,
  );
  const c = conversation.data?.data;
  return (
    <>
      {mapping && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2 text-xs">
          <Tag color="blue">
            {mapping.kind === "personal" ? "需求与协作" : "科研协作"}
          </Tag>
          <span>
            {c
              ? `${
                  c.members.filter((m) => m.status === "joined").length
                } 个已加入身份 · ${c.taskIds.length} 个可读取关联任务`
              : "正在核对科研权限…"}
          </span>
          <Button size="small" onClick={() => setOpen(true)}>
            任务与成员
          </Button>
          {conversation.error && (
            <span className="text-red-700">{conversation.error}</span>
          )}
        </div>
      )}
      <Modal
        title="科研协作"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={680}
        destroyOnClose
      >
        {!c ? (
          <Alert
            type="warning"
            message={conversation.error || "没有当前可读取的科研会话"}
          />
        ) : (
          <div className="space-y-4">
            <section>
              <h3>成员</h3>
              <MemberList conversationId={c.id} />
            </section>
            <section>
              <h3>关联任务</h3>
              {!c.taskIds.length ? (
                <p>暂无可读取的关联任务。接受任务邀请后可查看获准的任务详情。</p>
              ) : (
                <Space wrap>
                  {c.taskIds.map((id) => (
                    <Button key={id} onClick={() => setTaskId(id)}>
                      查看任务 {id}
                    </Button>
                  ))}
                </Space>
              )}
            </section>
            <section>
              <h3>建议与回执</h3>
              {actions.error && <Alert type="error" message={actions.error} />}{" "}
              {actions.data?.data.map((action) => (
                <ResearchActionCard
                  key={action.id + ":" + action.version + ":" + action.status}
                  action={action}
                />
              ))}
            </section>
            <section>
              <h3>会话记忆</h3>
              <MemoryPanel
                scope="conversation"
                scopeId={c.id}
                canManage={c.allowedActions.includes("manage_memory")}
              />
            </section>
          </div>
        )}
      </Modal>
      <Modal
        title="任务详情"
        open={!!taskId}
        onCancel={() => setTaskId("")}
        footer={null}
        width={680}
        destroyOnClose
      >
        {taskId && <ResearchTaskPanel key={taskId} taskId={taskId} />}
      </Modal>
    </>
  );
}
function MemberList({ conversationId }: { conversationId: string }) {
  const { data, error, refresh } = useResearchRead(
    () => researchApi("chatConversation", { params: { id: conversationId } }),
    conversationId,
  );
  const contacts = useResearchStore((s) => s.contacts);
  return (
    <>
      {error && <Alert type="error" message={error} />}{" "}
      {data?.data.members.map((member) => {
        const c = contacts.find((c) => c.contact.id === member.contactId)?.contact;
        return (
          <p key={member.contactId} className="my-2">
            {c?.displayName || member.contactId}{" "}
            <Tag>{c?.identity.kind === "human" ? "真人" : "AI"}</Tag>{" "}
            {member.status === "joined"
              ? "已加入"
              : member.status === "invited"
              ? "待同意"
              : member.status === "declined"
              ? "已拒绝"
              : "已移除"}{" "}
            {data.data.allowedActions.includes("manage") &&
              member.status !== "revoked" &&
              member.role !== "owner" && (
                <Button
                  size="small"
                  danger
                  onClick={() =>
                    Modal.confirm({
                      title: `移除 ${c?.displayName || member.contactId}？`,
                      content:
                        "取消群访问权，任务承接独立处理；不能撤回已下载的 IM 文件。",
                      onOk: async () => {
                        await researchApi("revokeChatMember", {
                          params: { id: conversationId, contactId: member.contactId },
                          body: {
                            expectedVersion: member.version,
                            expectedConversationVersion: data.data.version,
                            reason: "负责人明确移除群成员",
                          },
                        });
                        await researchApi("imSyncConversation", {
                          params: { id: conversationId },
                          body: {},
                        });
                        await refresh();
                        await useResearchStore.getState().refresh();
                      },
                    })
                  }
                >
                  移除成员
                </Button>
              )}
          </p>
        );
      })}
    </>
  );
}
