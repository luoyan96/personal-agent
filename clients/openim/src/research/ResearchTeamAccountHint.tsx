import { Link } from "react-router-dom";
import { useResearchStore } from "./store";
export function ResearchTeamAccountHint() {
  const actor = useResearchStore((s) => s.actor);
  return (
    <p className="research-team-scope workspace-muted">
      {actor?.spaceKind === "personal"
        ? "当前是个人空间，可先独立规划。"
        : "分工面向当前课题组成员。"}{" "}
      <Link to="/me?view=labs">管理课题组</Link>
    </p>
  );
}
