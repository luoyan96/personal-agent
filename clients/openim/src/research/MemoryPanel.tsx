import { Alert, Button, Input, Modal, Segmented, Space } from "antd";
import { useEffect, useState } from "react";
import type { AssistantMemory, ChatMemory } from "@research-agent-platform/contracts";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";

type MemoryView = {
  id: string;
  topic: string;
  content: string;
  source: string | null;
  status: "active" | "revoked";
  conflict: boolean;
  version: number;
  allowedActions: string[];
};

function fromAssistant(memory: AssistantMemory): MemoryView {
  const payload = memory.payload as { text?: string; value?: string };
  return {
    id: memory.id,
    topic: memory.topic,
    content: memory.detail || payload.text || payload.value || memory.summary,
    source: memory.source.label || memory.source.id,
    status: memory.status === "revoked" ? "revoked" : "active",
    conflict: memory.conflict,
    version: memory.version,
    allowedActions: memory.allowedActions.filter(
      (action) => action !== "edit" || memory.type === "note",
    ),
  };
}
function fromChat(memory: ChatMemory): MemoryView {
  return {
    id: memory.id,
    topic: "记忆",
    content: memory.content,
    source: memory.source,
    status: memory.status,
    conflict: false,
    version: memory.version,
    allowedActions: memory.allowedActions,
  };
}
async function readMemories(
  scope: "private_agent" | "conversation",
  scopeId: string,
  notes: boolean,
  signal: AbortSignal,
) {
  if (notes) {
    const response = await researchApi("assistantMemories", {
      signal,
      query: { scope: "agent", subjectId: scopeId, status: "confirmed", limit: 100 },
    });
    return {
      data: response.data.map(fromAssistant),
      nextCursor: response.nextCursor,
    };
  }
  const response = await researchApi("chatMemories", {
    signal,
    query: { scope, scopeId, limit: 100 },
  });
  return {
    data: response.data.map(fromChat),
    nextCursor: response.nextCursor,
  };
}
const noteFields = (topic: string, content: string, source: string | null) => ({
  topic,
  type: "note" as const,
  summary: content.slice(0, 300),
  detail: content,
  payload: { type: "note" as const, text: content },
  source: {
    kind: "manual" as const,
    id: null,
    version: null,
    label: source,
  },
});

type MemoryPanelProps = {
  scope: "private_agent" | "conversation";
  scopeId: string;
  canManage: boolean;
  styleChatAvailable?: boolean;
};

export function MemoryPanel(props: MemoryPanelProps) {
  const availability = useWorkspaceAvailability(props.scope === "private_agent");
  const [tab, setTab] = useState("habits");
  const hasNotes = props.scope === "private_agent" && availability.supports(49);
  const notes = hasNotes && tab === "notes";
  return (
    <>
      {hasNotes && (
        <Segmented
          value={tab}
          onChange={(value) => setTab(String(value))}
          options={[
            { label: "交流习惯", value: "habits" },
            { label: "助理笔记", value: "notes" },
          ]}
        />
      )}
      <MemoryPanelBody
        key={JSON.stringify([props.scope, props.scopeId, notes])}
        {...props}
        notes={notes}
      />
    </>
  );
}

function MemoryPanelBody({
  scope,
  scopeId,
  canManage,
  styleChatAvailable,
  notes,
}: MemoryPanelProps & { notes: boolean }) {
  const { data, error, refresh } = useResearchRead(
    (signal) => readMemories(scope, scopeId, notes, signal),
    `${scope}:${scopeId}:${notes}`,
  );
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [editing, setEditing] = useState<MemoryView>();
  const [history, setHistory] = useState<MemoryView[]>();
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [failure, setFailure] = useState("");
  const [jobId, setJobId] = useState("");
  const job = useResearchRead(
    (signal) =>
      researchApi("assistantMemoryCompressionJob", { params: { id: jobId }, signal }),
    `compression:${jobId}`,
    Boolean(jobId),
    { poll: (value) => !value || ["queued", "running"].includes(value.data.status) },
  );
  const status = job.data?.data.status;
  useEffect(() => {
    if (status === "succeeded") void refresh();
  }, [status, refresh]);
  const save = async () => {
    setBusy(true);
    setFailure("");
    try {
      if (editing) {
        if (notes)
          await researchApi("updateAssistantMemory", {
            params: { id: editing.id },
            body: {
              ...noteFields(topic || editing.topic || "记忆", content, source || null),
              expectedVersion: editing.version,
            },
          });
        else
          await researchApi("reviseChatMemory", {
            params: { id: editing.id },
            body: { expectedVersion: editing.version, content, source: source || null },
          });
      } else if (notes)
        await researchApi("createAssistantMemory", {
          body: {
            scope: "agent",
            subjectId: scopeId,
            ...noteFields(topic || "记忆", content, source || null),
          },
        });
      else
        await researchApi("createChatMemory", {
          body: { scope, scopeId, content, source: source || null },
        });
      setTopic("");
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
      {!notes && scope === "private_agent" && canManage && styleChatAvailable && (
        <p className="text-xs text-slate-600">
          希望它记住你的交流习惯，可以直接在私聊里说：“以后和我聊天，先给你的判断，别每次列清单。”保存后会在这里显示，可随时修改或撤回。
        </p>
      )}
      {(error || failure) && <Alert type="error" showIcon message={error || failure} />}
      {notes && canManage && (
        <Button
          size="small"
          loading={compressing}
          disabled={
            Boolean(jobId) &&
            !job.error &&
            status !== "failed" &&
            status !== "succeeded"
          }
          onClick={async () => {
            setCompressing(true);
            setFailure("");
            try {
              const response = await researchApi("compressAssistantMemories", {
                body: { subjectId: scopeId },
              });
              setJobId(response.data.id);
            } catch (err) {
              setFailure(err instanceof Error ? err.message : "压缩失败");
            } finally {
              setCompressing(false);
            }
          }}
        >
          压缩记忆
        </Button>
      )}
      {job.error && <Alert type="error" message={job.error} />}
      {status && (
        <p role="status">
          {status === "failed"
            ? job.data?.data.failure || "压缩失败"
            : status === "succeeded"
            ? "压缩完成"
            : status === "queued"
            ? "等待压缩"
            : "正在压缩"}
        </p>
      )}
      {data?.data.map((memory) => (
        <article key={memory.id} className="rounded border p-3">
          <p className="whitespace-pre-wrap">{memory.content}</p>
          <p className="text-xs text-slate-500">
            {memory.source || "未填写来源"} · 版本 {memory.version}
          </p>
          {memory.conflict && (
            <p className="text-xs text-amber-600">存在冲突，待确认</p>
          )}
          <Space wrap>
            {memory.allowedActions.includes("edit") && (
              <Button
                size="small"
                disabled={busy}
                onClick={() => {
                  setEditing(memory);
                  setTopic(memory.topic === "记忆" ? "" : memory.topic);
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
                      if (notes)
                        await researchApi("decideAssistantMemory", {
                          params: { id: memory.id },
                          body: { expectedVersion: memory.version, decision: "revoke" },
                        });
                      else
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
                  if (notes) {
                    const response = await researchApi("assistantMemoryHistory", {
                      params: { id: memory.id },
                    });
                    setHistory(response.data.revisions.map(fromAssistant));
                  } else {
                    const response = await researchApi("chatMemoryHistory", {
                      params: { id: memory.id },
                    });
                    setHistory(response.data.revisions.map(fromChat));
                  }
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
          {notes && (
            <Input
              aria-label="记忆主题"
              placeholder="主题，例如：引用格式"
              value={topic}
              maxLength={80}
              onChange={(e) => setTopic(e.target.value)}
            />
          )}
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
