import { Alert, Button, Segmented } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { AgentResearchCollections } from "./KnowledgeLibrary";
import "./agent-resources.scss";

export type OpenAgentSkills = (skillId?: string, agentId?: string) => void;

export function AgentResources({
  agentId,
  onOpenSkills,
}: {
  agentId: string;
  onOpenSkills?: OpenAgentSkills;
}) {
  const [tab, setTab] = useState("skills");
  return (
    <section className="agent-resources" aria-label="Agent 技能与资料">
      <h3>技能与资料</h3>
      <Segmented
        aria-label="助手配置栏目"
        value={tab}
        onChange={(v) => setTab(String(v))}
        options={[
          { label: "技能", value: "skills" },
          { label: "资料", value: "library" },
        ]}
      />
      {tab === "library" ? (
        <AgentResearchCollections agentId={agentId} />
      ) : (
        <AgentSkills agentId={agentId} onOpenSkills={onOpenSkills} />
      )}
    </section>
  );
}

function AgentSkills({
  agentId,
  onOpenSkills,
}: {
  agentId: string;
  onOpenSkills?: OpenAgentSkills;
}) {
  const read = useResearchRead(
    (signal) =>
      researchApi("installedSkills", { query: { scope: "mine", agentId }, signal }),
    `agent-bound-skills:${agentId}`,
  );
  const skills = read.data?.data || [];
  return (
    <section className="agent-skills" aria-label="已绑定技能">
      <div className="agent-resource-heading">
        <strong>已绑定技能{read.data ? ` · ${skills.length}` : ""}</strong>
        {onOpenSkills && (
          <Button size="small" onClick={() => onOpenSkills(undefined, agentId)}>
            添加技能
          </Button>
        )}
      </div>
      <p className="workspace-muted">
        技能是这个助手可使用的方法；聊天时仍需选择本次要使用的技能与参考。
      </p>
      {read.error && (
        <Alert
          type="warning"
          message={read.error}
          action={<Button onClick={read.refresh}>重试</Button>}
        />
      )}
      {!read.data && !read.error && <p role="status">正在读取绑定技能…</p>}
      {read.data && !skills.length && (
        <p>尚未绑定技能。可从技能库安装或选择已有方法。</p>
      )}
      {skills.map((skill) => (
        <article className="agent-skill-row" key={skill.id}>
          <div>
            <strong>{skill.name}</strong>
            <small>
              {skill.release || "未标版本"} · 修订 {skill.revision} ·{" "}
              {skill.enabled ? (skill.canCall ? "已启用" : "当前不可调用") : "已停用"}
            </small>
            <p>{skill.description}</p>
          </div>
          {onOpenSkills && (
            <Button size="small" onClick={() => onOpenSkills(skill.id, agentId)}>
              管理
            </Button>
          )}
        </article>
      ))}
    </section>
  );
}
