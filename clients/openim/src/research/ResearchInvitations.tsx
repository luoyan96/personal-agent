import { Alert, Button, Modal, Space, Tag } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchTaskPanel } from "./ResearchTaskPanel";

export function ResearchInvitations() {
  const actor = useResearchStore((s) => s.actor);
  const invitations = useResearchRead(
    () => researchApi("chatInvitations", { query: { limit: 100 } }),
    "group-invitations",
  );
  const tasks = useResearchRead(
    () =>
      researchApi("tasks", {
        query: { labId: actor!.member.labId, scope: "mine", limit: 100 },
      }),
    actor?.member.id || "",
    !!actor,
  );
  const [failure, setFailure] = useState(""),
    [taskId, setTaskId] = useState("");
  const contacts = useResearchStore((s) => s.contacts);
  return (
    <div className="h-full space-y-4 overflow-auto bg-white p-5">
      <h2 className="text-base font-bold">群邀请与任务承接</h2>
      <p className="text-xs text-slate-600">
        真人入群、私人 AI 授权、接受任务分别决定。允许自己的 AI
        加入群，不会把你本人加入群。
      </p>
      {(invitations.error || tasks.error || failure) && (
        <Alert type="error" message={invitations.error || tasks.error || failure} />
      )}{" "}
      {invitations.data?.data.map((invite) => (
        <article key={invite.id} className="rounded border p-3">
          <p>
            {invite.title} · 邀请{" "}
            {contacts.find((c) => c.contact.id === invite.invitedContactId)?.contact
              .displayName || invite.invitedContactId}{" "}
            <Tag>{invite.status}</Tag>
          </p>
          {invite.status === "pending" && (
            <Space>
              {(["accept", "decline"] as const).map((decision) => (
                <Button
                  key={decision}
                  onClick={() =>
                    Modal.confirm({
                      title:
                        decision === "accept"
                          ? "同意这个身份加入群？"
                          : "拒绝入群邀请？",
                      content:
                        "群内科研材料和任务详情仍按任务权限可见，不分享主人私人历史。",
                      onOk: async () => {
                        try {
                          await researchApi("decideChatInvitation", {
                            params: { id: invite.id },
                            body: { expectedVersion: invite.version, decision },
                          });
                          await researchApi("imSync", { body: {} });
                          await useResearchStore.getState().refresh();
                          await invitations.refresh();
                          await tasks.refresh();
                        } catch (err) {
                          setFailure(err instanceof Error ? err.message : "操作失败");
                          await invitations.refresh();
                        }
                      },
                    })
                  }
                >
                  {decision === "accept" ? "同意入群" : "拒绝"}
                </Button>
              ))}
            </Space>
          )}
        </article>
      ))}
      <h3>可查看的任务</h3>
      {tasks.data?.data.map((value) => (
        <Button key={value.id} onClick={() => setTaskId(value.id)}>
          {value.title}
        </Button>
      ))}
      <Modal
        title="任务详情与承接"
        open={!!taskId}
        onCancel={() => setTaskId("")}
        footer={null}
        width={680}
        destroyOnClose
      >
        {taskId && <ResearchTaskPanel key={taskId} taskId={taskId} />}
      </Modal>
    </div>
  );
}
