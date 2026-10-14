import { Modal } from "antd";
import { ReadOutlined, FileSearchOutlined } from "@ant-design/icons";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  communitySourceUrl,
  matchingCommunityEntries,
  type CommunityResearchEntry,
} from "./community-research-catalog";
import type { ResearchCategory } from "./capability-center";
import { CapabilityFeedCard, CapabilityOutcomePreview } from "./CapabilityFeedCard";
import { communityFeedCopy } from "./capability-feed-copy";

export function CommunityResearchCatalog({
  category,
  search,
}: {
  category: ResearchCategory;
  search: string;
}) {
  const [selected, setSelected] = useState<CommunityResearchEntry>();
  const entries = matchingCommunityEntries(category, search);
  const visibleSelection = entries.some((entry) => entry.id === selected?.id)
    ? selected
    : undefined;
  if (!entries.length) return null;
  return (
    <section className="community-research-catalog" aria-label="社区科研工具">
      {entries.map((entry) => {
        const Icon =
          entry.status === "offline_reviewed" ? FileSearchOutlined : ReadOutlined;
        return (
          <CapabilityFeedCard
            key={entry.id}
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
            preview={<CapabilityOutcomePreview id={entry.id} />}
            onOpen={() => setSelected(entry)}
          />
        );
      })}
      <Modal
        open={!!visibleSelection}
        title={visibleSelection?.name}
        footer={null}
        onCancel={() => setSelected(undefined)}
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
                ? "社区 Skill · 文字流程可安装，脚本待接入"
                : selected.localMetadataAdapter
                ? "本机元数据选入可用 · 上游 MCP 待接入"
                : "接入方案 · 尚不可调用"}
            </span>
            <h2>{communityFeedCopy[selected.id]?.title || selected.name}</h2>
            <p>{selected.summary}</p>
            <dl>
              {[
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
                  to={`/workbench?view=skills&catalog=${selected.id}`}
                >
                  准备安装到我的技能
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
    </section>
  );
}
