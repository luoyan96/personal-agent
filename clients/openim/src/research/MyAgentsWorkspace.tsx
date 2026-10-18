import { Alert, Button } from "antd";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Id } from "@research-agent-platform/contracts";
import { WorkbenchCapabilities } from "./CapabilitySquare";
import { SkillLibrary } from "./SkillLibrary";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";

export function MyAgentsWorkspace() {
  const [params, setParams] = useSearchParams();
  const generation = useResearchStore((s) => s.generation);
  const memberId = useResearchStore((s) => s.actor?.member.id);
  const legacy = params.get("view") === "skills";
  const library = legacy || params.get("panel") === "skills";
  const agentId = params.get("agent") || undefined;
  const validAgent = !!agentId && Id.safeParse(agentId).success;
  const target = useResearchRead(
    (signal) => researchApi("chatContact", { params: { id: agentId! }, signal }),
    `skill-library-target:${agentId}`,
    library && validAgent,
  );
  useEffect(() => {
    if (!legacy) return;
    const next = new URLSearchParams(params);
    next.set("view", "agents");
    next.set("panel", "skills");
    setParams(next, { replace: true });
  }, [legacy, params, setParams]);
  function openSkills(skillId?: string, forAgent?: string) {
    const next = new URLSearchParams({ view: "agents", panel: "skills" });
    if (skillId) next.set("skill", skillId);
    if (forAgent) next.set("agent", forAgent);
    setParams(next);
  }
  function back() {
    const next = new URLSearchParams({ view: "agents" });
    if (validAgent) next.set("agent", agentId!);
    setParams(next);
  }
  if (!library)
    return (
      <WorkbenchCapabilities
        view="mine"
        initialContactId={validAgent ? agentId : undefined}
        onOpenSkills={openSkills}
      />
    );
  const contact = target.data?.data;
  const owned =
    contact?.identity.kind === "personal_agent" &&
    contact.identity.ownerMemberId === memberId &&
    !contact.agentRuntime &&
    contact.allowedActions.includes("edit_profile");
  if (agentId && !owned)
    return (
      <section className="agent-library-gate">
        <Button onClick={back}>返回我的 Agent</Button>
        {target.error || !validAgent || target.data ? (
          <Alert
            type="warning"
            message={target.error || "只能为自己的站内 Agent 配置技能。"}
          />
        ) : (
          <p role="status">正在读取助手配置…</p>
        )}
        {target.error && <Button onClick={target.refresh}>重试读取</Button>}
      </section>
    );
  return (
    <SkillLibrary
      key={`${generation}:${agentId}:${params.get("skill")}:${params.get("catalog")}`}
      catalogId={params.get("catalog") || undefined}
      initialSkillId={params.get("skill") || undefined}
      targetAgent={owned ? contact : undefined}
      onBack={back}
    />
  );
}
