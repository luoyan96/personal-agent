import { Alert, Button, Input, Modal, Space } from "antd";
import { useState } from "react";
import type { ChatMemory } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";

export function MemoryPanel({
  scope,
  scopeId,
  canManage,
}: {
  scope: "private_agent" | "conversation";
  scopeId: string;
  canManage: boolean;
}) {
  const { data, error, refresh } = useResearchRead(
    () => researchApi("chatMemories", { query: { scope, scopeId, limit: 100 } }),
    `${scope}:${scopeId}`,
  );
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [editing, setEditing] = useState<ChatMemory>();
  const [history, setHistory] = useState<ChatMemory[]>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const save = async () => {
    setBusy(true);
    setFailure("");
    try {
      if (editing)
        await researchApi("reviseChatMemory", {
          params: { id: editing.id },
          body: { expectedVersion: editing.version, content, source: source || null },
        });
      else
        await researchApi("createChatMemory", {
          body: { scope, scopeId, content, source: source || null },
        });
      setContent("");
      setSource("");
      setEditing(undefined);
      await refresh();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "保存失败");
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="记忆" className="space-y-3">
      <p className="text-xs text-slate-600">
        {scope === "private_agent"
          ? "仅你可管理的 Agent 私有记忆；添加这个 Agent 的其他人不能查看这些内容。"
          : "当前会话的共享记忆；已加入的真人成员可查看，负责人管理。"}{" "}
        内容仅在获准的范围内用于后续 AI 请求。
      </p>
      {(error || failure) && <Alert type="error" showIcon message={error || failure} />}
      {data?.data.map((memory) => (
        <article key={memory.id} className="rounded border p-3">
          <p className="whitespace-pre-wrap">{memory.content}</p>
          <p className="text-xs text-slate-500">
            {memory.source || "未填写来源"} · 版本 {memory.version}
          </p>
          <Space wrap>
            {memory.allowedActions.includes("edit") && (
              <Button
                size="small"
                disabled={busy}
                onClick={() => {
                  setEditing(memory);
                  setContent(memory.content);
                  setSource(memory.source || "");
                }}
              >
                编辑
              </Button>
            )}
            {memory.allowedActions.includes("revoke") && (
              <Button
                size="small"
                danger
                disabled={busy}
                onClick={() =>
                  Modal.confirm({
                    title: "移除这条记忆？",
                    content: "保留历史记录，后续 AI 请求不再使用该内容。",
                    onOk: async () => {
                      await researchApi("revokeChatMemory", {
                        params: { id: memory.id },
                        body: { expectedVersion: memory.version },
                      });
                      await refresh();
                    },
                  })
                }
              >
                移除
              </Button>
            )}
            <Button
              size="small"
              onClick={async () => {
                try {
                  setHistory(
                    (
                      await researchApi("chatMemoryHistory", {
                        params: { id: memory.id },
                      })
                    ).data.revisions,
                  );
                } catch (err) {
                  setFailure(String(err));
                }
              }}
            >
              历史
            </Button>
          </Space>
        </article>
      ))}
      {data && !data.data.length && (
        <p className="text-slate-500">
          尚未保存记忆。例如可以记录实际采用的引用格式或数据处理偏好。
        </p>
      )}
      {canManage && (
        <div className="space-y-2">
          <label>
            {editing ? `编辑记忆 · 版本 ${editing.version}` : "保存记忆"}
            <Input.TextArea
              aria-label="记忆内容"
              value={content}
              maxLength={2000}
              rows={3}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          <Input
            aria-label="记忆来源"
            placeholder="来源（可选）"
            value={source}
            maxLength={1000}
            onChange={(e) => setSource(e.target.value)}
          />
          <Space>
            <Button
              type="primary"
              loading={busy}
              disabled={!content.trim() || !data}
              onClick={() => void save()}
            >
              保存记忆
            </Button>
            {editing && (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setContent("");
                  setSource("");
                }}
              >
                取消编辑
              </Button>
            )}
          </Space>
        </div>
      )}
      <Modal
        title="记忆历史"
        open={!!history}
        footer={null}
        onCancel={() => setHistory(undefined)}
      >
        {history?.map((item) => (
          <article key={item.version} className="my-3">
            <p>
              版本 {item.version} · {item.status === "revoked" ? "已移除" : "已保存"}
            </p>
            <p className="whitespace-pre-wrap">{item.content}</p>
          </article>
        ))}
      </Modal>
    </section>
  );
}
