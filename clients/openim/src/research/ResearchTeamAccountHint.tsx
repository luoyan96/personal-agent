import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";

export function ResearchTeamAccountHint() {
  const actor = useResearchStore((s) => s.actor);
  const manager = actor?.spaceKind === "laboratory" && actor.isLabManager;
  const address = useResearchRead(
    async () => {
      const service = await window.electronAPI?.getResearchServiceStatus();
      const url = new URL(service?.address || window.location.origin);
      if (!["https:", "http:"].includes(url.protocol))
        throw new Error("服务地址不可用");
      return new URL("/manage/invites", url.origin).href;
    },
    `research-team-account:${actor?.member.id}`,
    manager,
  );
  return (
    <p className="research-team-scope workspace-muted">
      {actor?.spaceKind === "personal"
        ? "当前是个人空间，可先独立规划。"
        : "分工仅面向同一课题组账号。"}
      团队成员需要通过负责人签发的课题组邀请码注册对应账号；添加通讯录好友不会加入课题组。
      {manager && address.data ? (
        <>
          {" "}
          <a href={address.data} target="_blank" rel="noreferrer">
            网页邀请管理
          </a>
          （需登录负责人账号）
        </>
      ) : null}
    </p>
  );
}
