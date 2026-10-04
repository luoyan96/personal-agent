import { Alert, Button, Modal, Space, Tag } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";

export function ResearchRequests() {
  const { data, error, refresh } = useResearchRead(
    () => researchApi("contactRequests", { query: { status: "all", limit: 100 } }),
    "requests",
  );
  const contacts = useResearchStore((s) => s.contacts);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const name = (id: string) =>
    contacts.find((c) => c.contact.id === id)?.contact.displayName || id;
  const command = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setFailure("");
    try {
      await run();
      await researchApi("imSync", { body: {} });
      await useResearchStore.getState().refresh();
      await refresh();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "操作失败");
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="h-full space-y-3 overflow-auto bg-white p-5">
      <h2 className="text-base font-bold">联系人申请与授权</h2>
      {(error || failure) && <Alert type="error" message={error || failure} />}
      {data?.data.map((request) => (
        <article key={request.id} className="rounded border p-4">
          <p>
            {name(request.requesterContactId)} → {name(request.targetContactId)}{" "}
            <Tag>
              {
                {
                  pending: "等待同意",
                  accepted: "已同意",
                  declined: "已拒绝",
                  revoked: "已撤销",
                }[request.status]
              }
            </Tag>
          </p>
          <Space>
            {request.allowedDecisions.map((decision) => (
              <Button
                key={decision}
                loading={busy}
                onClick={() =>
                  void command(() =>
                    researchApi("decideContactRequest", {
                      params: { id: request.id },
                      body: { expectedVersion: request.version, decision },
                    }),
                  )
                }
              >
                {decision === "accept" ? "同意" : "拒绝"}
              </Button>
            ))}
            {(request.status === "pending" || request.status === "accepted") && (
              <Button
                danger
                disabled={busy}
                onClick={() =>
                  Modal.confirm({
                    title: request.status === "pending" ? "撤回申请？" : "撤销授权？",
                    content: "取消此联系人关系，不自动撤销独立群成员身份和已承接任务。",
                    onOk: () =>
                      command(() =>
                        researchApi("revokeContactRequest", {
                          params: { id: request.id },
                          body: { expectedVersion: request.version },
                        }),
                      ),
                  })
                }
              >
                {request.status === "pending" ? "撤回申请" : "撤销授权"}
              </Button>
            )}
          </Space>
        </article>
      ))}
      {data && !data.data.length && <p>暂无联系人申请</p>}
    </div>
  );
}
