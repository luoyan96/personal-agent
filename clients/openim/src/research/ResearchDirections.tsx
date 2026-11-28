import { Alert, Button, Input, Space } from "antd";
import { useState, useSyncExternalStore } from "react";
import { researchApi, ResearchApiError } from "./api";
import {
  subscribeServiceVersion,
  supportsLiteratureRecommendations,
} from "./service-version";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";

export function ResearchDirections({ labId }: { labId?: string }) {
  const available = useSyncExternalStore(
    subscribeServiceVersion,
    supportsLiteratureRecommendations,
  );
  const generation = useResearchStore((s) => s.generation);
  const actor = useResearchStore((s) => s.actor?.member.id);
  if (!available || !actor) return null;
  return (
    <DirectionEditor key={JSON.stringify([generation, actor, labId])} labId={labId} />
  );
}

function DirectionEditor({ labId }: { labId?: string }) {
  const title = labId ? "课题组研究方向" : "我的研究方向";
  const scope = "literature-directions:" + (labId ?? "mine");
  const operation = usePersonalOperation(true, scope);
  const read = useResearchRead(
    async (signal) =>
      labId
        ? (
            await researchApi("labResearchDirections", {
              params: { id: labId },
              signal,
            })
          ).data
        : (await researchApi("myResearchDirections", { signal })).data,
    scope,
  );
  const [draft, setDraft] = useState<{ text: string; version: number }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!draft || saving) return;
    const directions = [
      ...new Set(
        draft.text
          .split(/[\n，,；;]/u)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (directions.length > 10 || directions.some((s) => s.length > 120)) {
      setError("最多填写 10 个方向，每个方向最多 120 字。");
      return;
    }
    const { isCurrent } = operation.capture();
    const body = { directions, expectedVersion: draft.version };
    setSaving(true);
    setError("");
    try {
      if (labId)
        await researchApi("updateLabResearchDirections", {
          params: { id: labId },
          body,
          idempotencyKey: crypto.randomUUID(),
        });
      else
        await researchApi("updateMyResearchDirections", {
          body,
          idempotencyKey: crypto.randomUUID(),
        });
      if (!isCurrent()) return;
      setDraft(undefined);
      await read.refresh();
    } catch (failure) {
      if (!isCurrent()) return;
      if (failure instanceof ResearchApiError && failure.status === 409) {
        setDraft(undefined);
        await read.refresh();
        if (isCurrent()) setError("研究方向已经更新，请按最新内容重新编辑。");
      } else
        setError(failure instanceof Error ? failure.message : "保存失败，请重试。");
    } finally {
      if (isCurrent()) setSaving(false);
    }
  }
  return (
    <section aria-label={title} className="my-profile-details">
      <h3>{title}</h3>
      {read.error && (
        <Alert
          type="warning"
          message={read.error}
          action={<Button onClick={read.refresh}>重试</Button>}
        />
      )}
      {error && <Alert type="warning" message={error} />}
      {read.data &&
        (draft && read.data.canEdit ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Input.TextArea
              aria-label={title}
              placeholder="每行一个研究方向"
              rows={3}
              value={draft.text}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              disabled={saving}
            />
            <Space>
              <Button type="primary" onClick={save} loading={saving}>
                保存
              </Button>
              <Button
                onClick={() => {
                  setDraft(undefined);
                  setError("");
                }}
                disabled={saving}
              >
                取消
              </Button>
            </Space>
          </Space>
        ) : (
          <Space wrap>
            <span>
              {read.data.directions.join("、") ||
                (labId ? "尚未设置" : "使用当前课题组的方向")}
            </span>
            {read.data.canEdit && (
              <Button
                size="small"
                onClick={() => {
                  setDraft({
                    text: read.data!.directions.join("\n"),
                    version: read.data!.version,
                  });
                  setError("");
                }}
              >
                编辑方向
              </Button>
            )}
          </Space>
        ))}
    </section>
  );
}
