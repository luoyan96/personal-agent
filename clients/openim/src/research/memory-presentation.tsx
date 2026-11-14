import { useState } from "react";
import type { PersonalMemory } from "@research-agent-platform/contracts";

export const memoryOrigins = {
  explicit: "本人明确保存",
  feedback: "来自聊天或任务反馈",
  inferred: "助理提出的候选",
};

export function generalHabits(memories: PersonalMemory[]) {
  return memories.filter(
    (memory) => memory.status === "confirmed" && memory.scope === "general"
  );
}

/** Presentation only: the full stored text remains intact and searchable. */
export function MemoryText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = text.length > 120 || text.split("\n").length > 2;
  return (
    <div className={`habit-content ${canExpand ? "can-collapse" : ""} ${expanded ? "expanded" : ""}`}>
      <p>{text}</p>
      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起全文" : "展开全文"}
        </button>
      )}
    </div>
  );
}
