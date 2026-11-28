import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
} from "antd";
import { useRef, useState } from "react";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";

type Episode = ResponseFor<"assistantRelationshipMemories">["data"][number];
type Mode = ResponseFor<"assistantProactiveSettings">["data"]["mode"];

function EpisodeSource({ source }: { source: Episode["source"] }) {
  const detail = useResearchRead(
    (signal) =>
      researchApi("chatMessageDetails", {
        params: { id: source.conversationId, messageId: source.messageId },
        signal,
      }),
    `companion-source:${source.conversationId}:${source.messageId}`,
  );
  if (detail.error) return <Alert type="error" message={detail.error} />;
  if (!detail.data) return <Spin size="small" />;
  return (
    <blockquote>
      {detail.data.data.withdrawn ? "原消息已撤回" : detail.data.data.message.text}
    </blockquote>
  );
}

export function CompanionMemoryDialog({ onClose }: { onClose: () => void }) {
  const operation = usePersonalOperation(true, "companion-memory");
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const memories = useResearchRead(
    (signal) =>
      researchApi("assistantRelationshipMemories", {
        query: { limit: 12, cursor },
        signal,
      }),
    `companion-episodes:${operation.scope}:${cursor ?? ""}`,
  );
  const settings = useResearchRead(
    (signal) => researchApi("assistantProactiveSettings", { signal }),
    `companion-proactive:${operation.scope}`,
  );
  const [editing, setEditing] = useState<Episode>();
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const inFlight = useRef(false);
  async function save(write: () => Promise<unknown>, after: () => Promise<void>) {
    if (inFlight.current) return;
    const ticket = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      await write();
      if (ticket.isCurrent()) await after();
    } catch (error) {
      if (ticket.isCurrent())
        setFailure(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally {
      inFlight.current = false;
      if (ticket.isCurrent()) setBusy(false);
    }
  }
  const reload = () => {
    setEditing(undefined);
    setFailure("");
    void Promise.all([memories.refresh(), settings.refresh()]);
  };
  const update = (item: Episode, action: "edit" | "resolve" | "forget") => {
    void save(
      () =>
        researchApi("updateAssistantRelationshipMemory", {
          params: { id: item.id },
          body:
            action === "edit"
              ? {
                  operation: action,
                  expectedVersion: item.version,
                  subject: item.subject.trim(),
                  text: item.text.trim(),
                }
              : { operation: action, expectedVersion: item.version },
        }),
      async () => {
        setEditing(undefined);
        if (action === "forget" && cursor && memories.data?.data.length === 1) {
          setPages((value) => value.slice(0, -1));
        } else {
          await memories.refreshChecked();
        }
      },
    );
  };
  const policy = settings.data?.data;
  return (
    <Modal title="助理近况与问候" open onCancel={onClose} footer={null} width={560}>
      <div className="companion-memory">
        <div className="companion-learning">
          <span>自动记录新的私聊经历</span>
          <Switch
            aria-label="自动记录新的私聊经历"
            disabled={!policy || busy}
            checked={policy?.learnFromChat ?? false}
            onChange={(learnFromChat) => {
              if (!policy) return;
              void save(
                () =>
                  researchApi("updateAssistantProactiveSettings", {
                    body: {
                      expectedVersion: policy.version,
                      mode: policy.mode,
                      learnFromChat,
                    },
                  }),
                settings.refreshChecked,
              );
            }}
          />
        </div>
        <label>
          主动聊天
          <Select<Mode>
            aria-label="主动聊天"
            value={policy?.mode}
            disabled={!policy || busy}
            options={[
              { value: "off", label: "关闭" },
              { value: "greeting", label: "只说早安" },
              { value: "contextual", label: "可以接着聊近期的事" },
            ]}
            onChange={(mode) => {
              if (!policy) return;
              void save(
                () =>
                  researchApi("updateAssistantProactiveSettings", {
                    body: { mode, expectedVersion: policy.version },
                  }),
                settings.refreshChecked,
              );
            }}
          />
        </label>
        {(failure || memories.error || settings.error) && (
          <Alert
            type="error"
            message={failure || memories.error || settings.error}
            action={
              <Button size="small" onClick={reload} disabled={busy}>
                重新读取
              </Button>
            }
          />
        )}
        <h3>我们聊过的事</h3>
        {!memories.data && memories.loading && <Spin size="small" />}
        {memories.data?.data.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有近期经历" />
        )}
        {memories.data?.data.map((item) => (
          <article key={item.id}>
            {editing?.id === item.id ? (
              <>
                <Input
                  aria-label="经历主题"
                  value={editing.subject}
                  maxLength={80}
                  disabled={busy}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                />
                <Input.TextArea
                  aria-label="经历内容"
                  value={editing.text}
                  maxLength={600}
                  disabled={busy}
                  autoSize
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                />
                <Space>
                  <Button
                    size="small"
                    disabled={
                      busy ||
                      editing.subject.trim().length < 2 ||
                      editing.text.trim().length < 2
                    }
                    onClick={() => update(editing, "edit")}
                  >
                    保存
                  </Button>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => setEditing(undefined)}
                  >
                    取消
                  </Button>
                </Space>
              </>
            ) : (
              <>
                <strong>{item.subject}</strong>
                <small>
                  {item.status === "resolved"
                    ? "已告一段落"
                    : item.kind === "open_thread"
                    ? "待接着聊"
                    : "共同经历"}
                </small>
                <p>{item.text}</p>
                <Space wrap>
                  <Button size="small" disabled={busy} onClick={() => setEditing(item)}>
                    更正
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    aria-expanded={sourceId === item.id}
                    onClick={() => setSourceId(sourceId === item.id ? "" : item.id)}
                  >
                    原消息
                  </Button>
                  {item.status === "active" && item.kind === "open_thread" && (
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() => update(item, "resolve")}
                    >
                      这件事结束了
                    </Button>
                  )}
                  <Popconfirm
                    title="让助理忘记这条经历？"
                    okText="忘记"
                    cancelText="取消"
                    onConfirm={() => update(item, "forget")}
                  >
                    <Button size="small" disabled={busy}>
                      忘记
                    </Button>
                  </Popconfirm>
                </Space>
                {sourceId === item.id && <EpisodeSource source={item.source} />}
              </>
            )}
          </article>
        ))}
        {(pages.length > 1 || memories.data?.nextCursor) && (
          <Space>
            <Button
              disabled={busy || pages.length === 1}
              onClick={() => {
                setEditing(undefined);
                setPages(pages.slice(0, -1));
              }}
            >
              上一页
            </Button>
            <Button
              disabled={busy || !memories.data?.nextCursor}
              onClick={() => {
                setEditing(undefined);
                setPages([...pages, memories.data!.nextCursor!]);
              }}
            >
              下一页
            </Button>
          </Space>
        )}
      </div>
    </Modal>
  );
}
