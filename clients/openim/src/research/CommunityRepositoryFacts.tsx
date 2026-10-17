import { StarOutlined, GithubOutlined } from "@ant-design/icons";
import type { GithubMetadata, ResponseFor } from "@research-agent-platform/contracts";
import { Button } from "antd";

export function communityDate(value: string | null | undefined) {
  if (!value) return "尚未获取";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function CommunityRepositoryFacts({
  github,
  reviewedRevision,
}: {
  github: GithubMetadata | null;
  reviewedRevision?: string;
}) {
  const stale =
    !!github?.syncedAt && Date.now() - Date.parse(github.syncedAt) > 36 * 3600000;
  return (
    <div className="community-repository-facts">
      <span aria-label="GitHub Star 数">
        <StarOutlined aria-hidden /> 仓库{" "}
        {github?.stars == null ? "—" : github.stars.toLocaleString("zh-CN")}
      </span>
      <span>代码更新 {communityDate(github?.pushedAt)}</span>
      {github?.latestRevision &&
        reviewedRevision &&
        github.latestRevision !== reviewedRevision && (
          <small>上游提交有变化 · 待审阅</small>
        )}
      {(github?.error || stale || !github?.syncedAt || github.archived) && (
        <small>
          {github?.archived
            ? "仓库已归档"
            : github?.error
            ? "同步未完成 · 保留缓存"
            : stale
            ? "缓存待更新"
            : "待首次同步"}
        </small>
      )}
    </div>
  );
}
export function CommunitySyncStatus({
  catalog,
  loading,
  error,
  onRefresh,
}: {
  catalog?: ResponseFor<"communityCatalog">["data"];
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
}) {
  const sync = catalog?.sync;
  return (
    <div className="community-sync-status" role="status">
      <span>
        <GithubOutlined />{" "}
        {error
          ? `社区目录读取失败：${error}`
          : !sync
          ? "正在读取社区目录…"
          : !sync.enabled
          ? "后台同步未开启"
          : sync.state === "running"
          ? "后台正在同步 GitHub"
          : sync.state === "never"
          ? "等待后台首次同步"
          : `${
              sync.state === "ok" ? "后台每日 00:00 同步" : "最近同步未全部完成"
            } · ${communityDate(sync.lastFinishedAt)}`}{" "}
        {catalog && <small> · {catalog.entries.length} 项已收录</small>}
      </span>
      <Button size="small" loading={loading} onClick={() => void onRefresh()}>
        刷新列表
      </Button>
    </div>
  );
}
