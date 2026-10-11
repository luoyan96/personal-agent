import { Button, Modal } from "antd";
import { ReadOutlined, FileSearchOutlined } from "@ant-design/icons";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  communitySourceUrl,
  matchingCommunityEntries,
  type CommunityResearchEntry,
} from "./community-research-catalog";
import type { ResearchCategory } from "./capability-center";

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
      <div className="capability-template-heading">
        <h2>社区科研工具</h2>
        <p>查看来源与接入条件，再决定是否安装。</p>
      </div>
      <div className="workspace-capability-grid">
        {entries.map((entry) => {
          const Icon =
            entry.status === "offline_reviewed" ? FileSearchOutlined : ReadOutlined;
          return (
            <article className="capability-template-card" key={entry.id}>
              <header>
                <span className="capability-template-icon">
                  <Icon />
                </span>
                <h3>{entry.name}</h3>
              </header>
              <span className="community-status">
                {entry.status === "offline_reviewed"
                  ? "离线样例已验证 · 自动执行待接入"
                  : "待连接 · 尚不可调用"}
              </span>
              <p>{entry.summary}</p>
              <dl>
                <div>
                  <dt>维护者与许可</dt>
                  <dd>
                    {entry.author} · {entry.license}
                  </dd>
                </div>
                <div>
                  <dt>适用输入</dt>
                  <dd>{entry.input}</dd>
                </div>
              </dl>
              <Button onClick={() => setSelected(entry)}>查看详情与接入方式</Button>
            </article>
          );
        })}
      </div>
      <Modal
        open={!!visibleSelection}
        title={visibleSelection?.name}
        footer={null}
        onCancel={() => setSelected(undefined)}
        destroyOnClose
        width={760}
        centered
        styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
      >
        {visibleSelection && selected && (
          <div className="community-research-detail">
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
              <p className="workspace-muted">
                此条目仅收录接入方案；连接与权限适配完成后再开放安装。
              </p>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
