import { Alert, Button, Modal } from "antd";
import {
  ReadOutlined,
  EditOutlined,
  ExperimentOutlined,
  LineChartOutlined,
  CodeOutlined,
  ProfileOutlined,
} from "@ant-design/icons";
import { useRef, useState } from "react";
import {
  agentStarters,
  findOwnedStarter,
  type AgentStarter,
} from "./agentStarterProfiles";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchStore } from "./store";
import { capabilityCategory, type ResearchCategory } from "./capability-center";
import { CapabilityFeedCard, CapabilityOutcomePreview } from "./CapabilityFeedCard";
import { starterFeedCopy } from "./capability-feed-copy";

export function matchingStarterTemplates(category: ResearchCategory, search: string) {
  const query = search.trim().toLocaleLowerCase();
  return agentStarters.filter(
    (starter) =>
      (category === "全部" ||
        capabilityCategory({
          displayName: starter.profile.displayName,
          profile: { ...starter.profile, role: "specialist", version: 1 },
        }) === category) &&
      [
        starter.profile.displayName,
        starter.summary,
        starter.input,
        starterFeedCopy[starter.id]?.title,
        starterFeedCopy[starter.id]?.outcomes,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
  );
}

export function CapabilityTemplates({
  category,
  search,
  onChanged,
  onConfigure,
}: {
  category: ResearchCategory;
  search: string;
  onChanged: () => Promise<void>;
  onConfigure: (id: string) => void;
}) {
  const read = useResearchRead(
    (signal) =>
      researchApi("chatContacts", { query: { view: "mine", limit: 100 }, signal }),
    "capability-template-owned",
  );
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const [selected, setSelected] = useState<AgentStarter>(),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const saved = useRef<Record<string, string>>({});
  const operation = usePersonalOperation(
    true,
    `capability-template:${selected?.id || ""}`,
  );
  const add = async () => {
    if (!selected || !actorId || busy) return;
    const { isCurrent } = operation.capture();
    setBusy(true);
    setFailure("");
    try {
      const owned = await researchApi("chatContacts", {
        query: { view: "mine", limit: 100 },
      });
      if (!isCurrent()) return;
      let contactId =
        saved.current[selected.id] ||
        findOwnedStarter(owned.data, selected, actorId)?.id;
      if (!contactId) {
        const created = await researchApi("createPersonalAgent", {
          body: selected.profile,
        });
        if (!isCurrent()) return;
        contactId = created.data.id;
        saved.current[selected.id] = contactId;
      }
      await Promise.all([read.refresh(), onChanged()]);
      if (isCurrent()) {
        setSelected(undefined);
        onConfigure(contactId);
      }
    } catch (error) {
      if (isCurrent())
        setFailure(
          error instanceof Error ? error.message : "添加失败，配置已保留，请重试。",
        );
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const icons: Record<string, typeof ReadOutlined> = {
    "literature-reading": ReadOutlined,
    "paper-revision": EditOutlined,
    "research-planning": ExperimentOutlined,
    "figure-planning": LineChartOutlined,
    "data-reproduction": CodeOutlined,
    "lab-meeting": ProfileOutlined,
  };
  const matching = matchingStarterTemplates(category, search);
  const visibleSelection = matching.find((starter) => starter.id === selected?.id);
  const selectedExisting =
    visibleSelection &&
    (saved.current[visibleSelection.id] ||
      findOwnedStarter(read.data?.data || [], visibleSelection, actorId || "")?.id);
  return (
    <section className="capability-templates" aria-label="内置科研助手">
      {read.error && (
        <Alert
          type="warning"
          message={read.error}
          action={<Button onClick={read.refresh}>重试</Button>}
        />
      )}
      {matching.map((starter) => {
        const Icon = icons[starter.id] || ProfileOutlined;
        const existing =
          saved.current[starter.id] ||
          findOwnedStarter(read.data?.data || [], starter, actorId || "")?.id;
        return (
          <CapabilityFeedCard
            key={starter.id}
            title={starterFeedCopy[starter.id]?.title || starter.profile.displayName}
            outcomes={starterFeedCopy[starter.id]?.outcomes || starter.summary}
            name={starter.profile.displayName}
            status={existing ? "已添加 · 私人文字 Agent" : "文字 Agent 模板"}
            icon={<Icon />}
            preview={<CapabilityOutcomePreview id={starter.id} />}
            onOpen={() => {
              setSelected(starter);
              setFailure("");
            }}
          />
        );
      })}
      <Modal
        open={!!visibleSelection}
        title={visibleSelection?.profile.displayName}
        footer={null}
        onCancel={() => !busy && setSelected(undefined)}
        closable={!busy}
        maskClosable={!busy}
        width={850}
        centered
        className="capability-use-modal"
        styles={{ body: { maxHeight: "calc(100vh - 150px)", overflowY: "auto" } }}
      >
        {visibleSelection && (
          <div className="capability-use-detail">
            <CapabilityOutcomePreview id={visibleSelection.id} />
            <div className="capability-use-content">
              <span className="capability-detail-kind">
                AcceptCat 内置 · 私人文字 Agent
              </span>
              <h2>
                {starterFeedCopy[visibleSelection.id]?.title ||
                  visibleSelection.profile.displayName}
              </h2>
              <p>{visibleSelection.summary}</p>
              <dl>
                <div>
                  <dt>你会得到</dt>
                  <dd>
                    {starterFeedCopy[visibleSelection.id]?.outcomes ||
                      visibleSelection.summary}
                  </dd>
                </div>
                <div>
                  <dt>准备这些材料</dt>
                  <dd>{visibleSelection.input}</dd>
                </div>
                <div>
                  <dt>如何开始</dt>
                  <dd>
                    添加助手，选择自己的模型和获准资料，然后在聊天里交代问题。示例展示交付形式，实际回复取决于提供的材料。
                  </dd>
                </div>
              </dl>
              <details className="capability-use-boundary">
                <summary>能力范围与资料权限</summary>
                <p>{visibleSelection.boundary}</p>
                <p>模板不授予资料、脚本或联网权限；回复使用当前获准的模型配置。</p>
              </details>
              {failure && <Alert type="error" message={failure} />}
              <Button
                type="primary"
                loading={busy}
                disabled={!read.data || !actorId}
                onClick={() => void add()}
              >
                {selectedExisting ? "打开我的 Agent 配置" : "添加为我的 Agent"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
