import { Alert, Button, Input, Modal, Segmented } from "antd";
import { useMemo, useState } from "react";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { CommunityResearchCatalog } from "./CommunityResearchCatalog";
import { CommunitySyncStatus } from "./CommunityRepositoryFacts";
import { researchCategories, type ResearchCategory } from "./capability-center";
import {
  emptyDiscoveryPreferences,
  readDiscoveryPreferences,
  saveDiscoveryPreferences,
  normalizeDiscoveryPreferences,
  rankCommunityDiscovery,
  type DiscoveryOrder,
} from "./community-discovery";

const orderLabels = { recommended: "推荐", popular: "最热门", latest: "最新" } as const;
type Tab = DiscoveryOrder | Exclude<ResearchCategory, "全部">;
export function CommunityDiscovery({
  actorId,
  expertise,
  catalog,
  loading,
  error,
  onRefresh,
  search,
  onClearSearch,
  onConfigure,
  operationScope,
}: {
  actorId: string;
  expertise: readonly string[];
  catalog?: ResponseFor<"communityCatalog">["data"];
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
  search: string;
  onClearSearch: () => void;
  onConfigure: (id: string) => void;
  operationScope?: string;
}) {
  const [tab, setTab] = useState<Tab>("recommended");
  const [preferences, setPreferences] = useState(() => {
    try {
      return readDiscoveryPreferences(localStorage, actorId);
    } catch {
      return emptyDiscoveryPreferences();
    }
  });
  const [editing, setEditing] = useState(false),
    [draftCategories, setDraftCategories] = useState<ResearchCategory[]>([]),
    [draftKeywords, setDraftKeywords] = useState(""),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState("");
  const order: DiscoveryOrder =
    tab in orderLabels ? (tab as DiscoveryOrder) : "recommended";
  const category: ResearchCategory =
    tab in orderLabels ? "全部" : (tab as ResearchCategory);
  const items = useMemo(
    () =>
      rankCommunityDiscovery(catalog, {
        category,
        order,
        preferences,
        expertise,
        search,
      }),
    [catalog, category, order, preferences, expertise, search],
  );
  const hasSignals =
    preferences.categories.length > 0 ||
    preferences.keywords.length > 0 ||
    expertise.some((k) => k.trim().length >= 2);
  const save = () => {
    const keywords = [
      ...new Set(
        draftKeywords
          .split(/[,，;；\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (keywords.length > 8 || keywords.some((k) => k.length < 2 || k.length > 40)) {
      setFailure("最多填写8个关注词，每个2–40字，用逗号分隔。");
      return;
    }
    const next = normalizeDiscoveryPreferences({
      categories: draftCategories,
      keywords,
    });
    setPreferences(next);
    setEditing(false);
    setFailure("");
    try {
      saveDiscoveryPreferences(localStorage, actorId, next);
      setNotice("");
    } catch {
      setNotice("本机未能保存推荐偏好，本次会话仍已应用；重新打开后需再次设置。");
    }
  };
  return (
    <>
      <nav className="community-discovery-tabs" aria-label="GitHub发现分类">
        <Segmented
          aria-label="发现排序与方向"
          value={tab}
          options={[
            ...Object.entries(orderLabels).map(([value, label]) => ({ value, label })),
            ...researchCategories
              .filter((c) => c !== "全部")
              .map((c) => ({ value: c, label: c })),
          ]}
          onChange={(v) => setTab(v as Tab)}
        />
      </nav>
      <CommunitySyncStatus
        catalog={catalog}
        loading={loading}
        error={error}
        onRefresh={onRefresh}
      />
      <div className="community-discovery-summary">
        <div>
          <h2>
            {category === "全部" ? orderLabels[order] : category}
            <span>
              {catalog
                ? `${items.length} 项 GitHub 能力`
                : error
                ? "暂未读取到目录"
                : "读取中"}
            </span>
          </h2>
          <p>
            {order === "popular"
              ? "按仓库 Star 从高到低排列，尚未获取的数据排在后面。"
              : order === "latest"
              ? "按仓库代码更新时间排列，最新更新的在前。"
              : hasSignals
              ? "根据关注方向、关键词和你填写的公开专长排列；卡片标明推荐理由。"
              : "先选关注方向，让推荐更贴近你的研究；当前优先展示已审阅文字流程。"}
          </p>
        </div>
        <Button
          onClick={() => {
            setDraftCategories(preferences.categories);
            setDraftKeywords(preferences.keywords.join("，"));
            setFailure("");
            setEditing(true);
          }}
        >
          调整推荐
        </Button>
      </div>
      {preferences.categories.length + preferences.keywords.length > 0 &&
        order === "recommended" && (
          <div className="community-interest-tags" aria-label="当前推荐偏好">
            {[...preferences.categories, ...preferences.keywords].map((v) => (
              <span key={v}>{v}</span>
            ))}
          </div>
        )}
      {notice && <Alert type="warning" message={notice} />}
      {catalog?.sync.discoveryState === "failed" && (
        <Alert type="warning" message="GitHub候选检索未完成，保留上次列表。" />
      )}
      {!catalog && !error && (
        <p role="status" className="community-discovery-loading">
          正在读取 GitHub 科研能力…
        </p>
      )}
      {catalog && !items.length && (
        <div className="capability-feed-empty">
          <p>没有找到匹配的 GitHub 科研能力。</p>
          <Button
            onClick={() => {
              setTab("recommended");
              onClearSearch();
            }}
          >
            清除筛选
          </Button>
        </div>
      )}
      <div className="capability-discovery-grid">
        <CommunityResearchCatalog
          items={items}
          showReasons={order === "recommended"}
          onConfigure={onConfigure}
          operationScope={`${operationScope}:${tab}:${search}:${editing}`}
        />
      </div>
      {!!items.length && (
        <p className="capability-center-boundary">
          Star
          与更新时间来自后台同步的仓库数据。可安装文字流程与待审阅、待接入工具分别标注，示例不代表实际生成结果。
        </p>
      )}
      <Modal
        title="让推荐更贴近你的研究"
        open={editing}
        onCancel={() => setEditing(false)}
        onOk={save}
        okText="保存偏好"
        cancelText="取消"
        destroyOnClose
        className="community-preferences-modal"
      >
        <div className="community-preferences-form">
          <p>选择你关注的研究工作，补充领域关键词。偏好仅为当前账号保存在这台电脑。</p>
          <div className="community-preferences-directions">
            <span>关注方向</span>
            <div role="group" aria-label="推荐关注方向">
              {researchCategories
                .filter((c) => c !== "全部")
                .map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    aria-pressed={draftCategories.includes(direction)}
                    onClick={() =>
                      setDraftCategories((previous) =>
                        previous.includes(direction)
                          ? previous.filter((c) => c !== direction)
                          : [...previous, direction],
                      )
                    }
                  >
                    {direction}
                  </button>
                ))}
            </div>
          </div>
          <label>
            研究关键词
            <Input
              aria-label="推荐研究关键词"
              value={draftKeywords}
              maxLength={328}
              onChange={(e) => setDraftKeywords(e.target.value)}
              placeholder="例如：单细胞、系统综述、科研绘图"
            />
          </label>
          <small>最多8个词，用逗号分隔；也会参考你在个人资料中填写的公开专长。</small>
          {failure && <Alert type="error" message={failure} />}
          <Button
            type="text"
            onClick={() => {
              setDraftCategories([]);
              setDraftKeywords("");
              setFailure("");
            }}
          >
            恢复默认推荐
          </Button>
        </div>
      </Modal>
    </>
  );
}
