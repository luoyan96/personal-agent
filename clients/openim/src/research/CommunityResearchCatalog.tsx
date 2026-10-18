import { Alert, Button, Modal } from "antd";
import { ReadOutlined, FileSearchOutlined, StarOutlined } from "@ant-design/icons";
import { useState } from "react";
import { Link } from "react-router-dom";
import { communitySourceUrl } from "./community-research-catalog";
import type { DiscoveryItem } from "./community-discovery";
import { CapabilityFeedCard, CapabilityOutcomePreview } from "./CapabilityFeedCard";
import { communityFeedCopy } from "./capability-feed-copy";
import { CommunityRepositoryFacts, communityDate } from "./CommunityRepositoryFacts";
import { CommunityAgentFeedCard } from "./CommunityAgentFeedCard";
import { communityAgentBindings } from "./community-agent-bindings";
import { useResearchRead } from "./useResearchRead";
import { researchApi } from "./api";
import { useResearchStore } from "./store";

export function CommunityResearchCatalog({
  items,
  showReasons = false,
  onConfigure,
  operationScope,
}: {
  items: readonly DiscoveryItem[];
  showReasons?: boolean;
  onConfigure: (id: string) => void;
  operationScope?: string;
}) {
  const actorId = useResearchStore((state) => state.actor?.member.id);
  const skills = useResearchRead(
    (signal) => researchApi("installedSkills", { query: { scope: "mine" }, signal }),
    "community-agent-skills",
  );
  const contacts = useResearchRead(
    (signal) =>
      researchApi("chatContacts", { query: { view: "mine", limit: 100 }, signal }),
    "community-agent-contacts",
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [candidateId, setCandidateId] = useState<string>();
  const entries = items.flatMap((item) =>
    item.kind === "reviewed" ? [item.entry] : [],
  );
  const candidates = items.flatMap((item) =>
    item.kind === "candidate" ? [item.candidate] : [],
  );
  const selected = entries.find((entry) => entry.id === selectedId);
  const visibleSelection = selected;
  const candidate = candidates.find((item) => item.repository === candidateId);
  const renderCandidate = (
    discovery: Extract<DiscoveryItem, { kind: "candidate" }>,
  ) => {
    const item = discovery.candidate;
    return (
      <CapabilityFeedCard
        key={discovery.key}
        openLabel={`查看${item.name}仓库`}
        title={item.name.split("/")[1] || item.name}
        name={item.name.split("/")[0] || item.name}
        outcomes={item.description || "仓库尚未提供用途说明。"}
        status="社区发现候选 · 未适配"
        icon={<ReadOutlined />}
        preview={
          <div className="capability-outcome-preview preview-blue community-candidate-preview">
            <span className="capability-preview-label">GitHub 发现 · 待审阅</span>
            <h4>{item.name.split("/")[1]}</h4>
            <p>{item.description || "先查看仓库原始说明。"}</p>
          </div>
        }
        metadata={
          <>
            {showReasons && (
              <p className="community-recommendation-reason">{discovery.reason}</p>
            )}
            <div className="community-repository-facts">
              <span aria-label="GitHub Star 数">
                <StarOutlined aria-hidden /> 仓库 {item.stars.toLocaleString("zh-CN")}
              </span>
              <span>代码更新 {communityDate(item.pushedAt)}</span>
            </div>
          </>
        }
        onOpen={() => setCandidateId(item.repository)}
      />
    );
  };

  return (
    <section className="community-research-catalog" aria-label="社区科研工具">
      {(skills.error || contacts.error) && (
        <Alert
          style={{ gridColumn: "1 / -1" }}
          type="warning"
          message="已添加的 Agent 状态暂未读取，可先查看社区资料。"
          action={
            <Button
              onClick={() => void Promise.all([skills.refresh(), contacts.refresh()])}
            >
              重试
            </Button>
          }
        />
      )}
      {items.map((discovery) => {
        if (discovery.kind === "candidate") return renderCandidate(discovery);
        const entry = discovery.entry;
        const Icon =
          entry.status === "offline_reviewed" ? FileSearchOutlined : ReadOutlined;
        return (
          <CommunityAgentFeedCard
            key={discovery.key}
            agents={
              skills.error || contacts.error
                ? []
                : communityAgentBindings(
                    entry,
                    skills.data?.data || [],
                    contacts.data?.data || [],
                    actorId || "",
                  )
            }
            onConfigure={onConfigure}
            operationScope={`${operationScope}:${selectedId}:${candidateId}`}
            title={communityFeedCopy[entry.id]?.title || entry.name}
            outcomes={communityFeedCopy[entry.id]?.outcomes || entry.summary}
            name={entry.name}
            status={
              entry.installable
                ? "社区 Skill · 可安装文字流程"
                : entry.localMetadataAdapter
                ? "本机元数据选入 · MCP 待接入"
                : "社区工具 · 待接入"
            }
            icon={<Icon />}
            preview={
              communityFeedCopy[entry.id] ? (
                <CapabilityOutcomePreview id={entry.id} />
              ) : (
                <div className="capability-outcome-preview preview-blue community-reviewed-preview">
                  <span className="capability-preview-label">
                    {entry.installable
                      ? "文字 Skill · 使用说明"
                      : "工具接入方案 · 待接入"}
                  </span>
                  <h4>{entry.name}</h4>
                  <dl>
                    <div>
                      <dt>准备什么</dt>
                      <dd>{entry.input}</dd>
                    </div>
                    <div>
                      <dt>{entry.installable ? "文字流程交付" : "接入后可交付"}</dt>
                      <dd>{entry.deliverables}</dd>
                    </div>
                  </dl>
                </div>
              )
            }
            metadata={
              <>
                {showReasons && (
                  <p className="community-recommendation-reason">{discovery.reason}</p>
                )}
                <CommunityRepositoryFacts
                  github={entry.github}
                  reviewedRevision={entry.revision}
                />
              </>
            }
            onOpen={() => setSelectedId(entry.id)}
          />
        );
      })}
      <Modal
        open={!!visibleSelection}
        title={visibleSelection?.name}
        footer={null}
        onCancel={() => setSelectedId(undefined)}
        destroyOnClose
        className="capability-community-modal"
        width={760}
        centered
        styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
      >
        {visibleSelection && selected && (
          <div className="community-research-detail">
            <span className="capability-detail-kind">
              {selected.installable
                ? "社区 Skill · 可安装文字流程，工具能力以依赖说明为准"
                : selected.localMetadataAdapter
                ? "本机元数据选入可用 · 上游 MCP 待接入"
                : "接入方案 · 尚不可调用"}
            </span>
            <h2>{communityFeedCopy[selected.id]?.title || selected.name}</h2>
            <p>{selected.summary}</p>
            <dl>
              {[
                [
                  "GitHub Star / Fork",
                  `${selected.github?.stars?.toLocaleString("zh-CN") ?? "尚未获取"} / ${
                    selected.github?.forks?.toLocaleString("zh-CN") ?? "尚未获取"
                  }`,
                ],
                ["仓库代码更新", communityDate(selected.github?.pushedAt)],
                ["最近成功同步", communityDate(selected.github?.syncedAt)],
                [
                  "上游与审阅版本",
                  selected.github?.latestRevision
                    ? `${
                        selected.github.latestRevision === selected.revision
                          ? "仓库当前提交与审阅提交一致"
                          : "仓库当前提交与审阅提交不同，尚未自动替换"
                      } · ${selected.github.latestRevision}`
                    : "尚未获取仓库当前提交；安装仍使用下面的审阅版本。",
                ],
                [
                  "仓库状态",
                  selected.github?.archived
                    ? "已归档；是否采用已审阅版本请结合使用条件判断。"
                    : selected.github?.error
                    ? "最近同步失败，以上保留上次成功数据。"
                    : selected.github?.syncedAt
                    ? "仓库元数据已同步，不能据此判断科研效果。"
                    : "尚未同步",
                ],
                ["准备什么", selected.input],
                ["交付物", selected.deliverables],
                ["资料与知识库", selected.materials],
                ["依赖与接入", selected.prerequisites],
                ["费用", selected.costs],
                ["实际验证", selected.validation],
                ["使用限制", selected.limitations],
                ["作者与许可", `${selected.author} · ${selected.license}`],
                [
                  "审阅版本",
                  `${selected.version} · ${selected.reviewedAt} · ${selected.revision}`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="community-links">
              <a
                href={communitySourceUrl(selected)}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看固定版本源码
              </a>
              {selected.discussions.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              ))}
            </div>
            {selected.installable ? (
              <>
                <p className="workspace-muted">
                  准备安装会打开“我的技能”，由你检查固定版本并确认。默认私人安装；不会公开资料或运行脚本。
                </p>
                <Link
                  className="community-install-link"
                  to={`/workbench?view=agents&panel=skills&catalog=${selected.id}`}
                >
                  在技能库中准备安装
                </Link>
              </>
            ) : (
              <>
                <p className="workspace-muted">
                  {selected.localMetadataAdapter
                    ? "在工作台选择自己的私人资料集合，点击“从 Zotero 选择”。读取和上传各自确认；不会安装上游 MCP，也不会自动读取本机资料。"
                    : "此条目仅收录接入方案；连接与权限适配完成后再开放安装。"}
                </p>
                {selected.localMetadataAdapter && (
                  <Link className="community-install-link" to="/workbench?view=library">
                    打开资料库，选择 Zotero 文献
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
      <Modal
        open={!!candidate}
        title={candidate?.name}
        footer={null}
        onCancel={() => setCandidateId(undefined)}
        className="capability-community-modal"
        centered
        width={700}
        styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
      >
        {candidate && (
          <div className="community-research-detail">
            <span className="capability-detail-kind">
              自动发现候选 · 尚未审阅、适配或安装
            </span>
            <p>{candidate.description || "仓库未填写介绍。"}</p>
            <dl>
              {[
                [
                  "GitHub Star / Fork",
                  `${candidate.stars.toLocaleString(
                    "zh-CN",
                  )} / ${candidate.forks.toLocaleString("zh-CN")}`,
                ],
                ["代码更新", communityDate(candidate.pushedAt)],
                [
                  "发现 / 最近检查",
                  `${communityDate(candidate.foundAt)} / ${communityDate(
                    candidate.checkedAt,
                  )}`,
                ],
                ["仓库声明许可", candidate.license || "未识别，待核对"],
                [
                  "使用状态",
                  "尚未检查 Skill 文件、依赖、素材要求和实际调用；这里仅提供来源。",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <a href={candidate.repository} target="_blank" rel="noopener noreferrer">
              查看 GitHub 原始仓库
            </a>
          </div>
        )}
      </Modal>
    </section>
  );
}
