import { Alert, Button } from "antd";
import { useState } from "react";
import type { DesktopReportArtifact } from "@/types/desktopWork";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { useWorkspaceConversation } from "./workspace-api";
import DesktopWorkCard from "./DesktopWorkCard";
import { useDesktopWork } from "./desktop-work";

export function WorkspaceReports({ active }: { active: boolean }) {
  const actorId = useResearchStore((s) => s.actor?.member.id),
    mappings = useResearchStore((s) => s.mappings);
  const jobs = useDesktopWork((s) => s.jobs);
  const operation = usePersonalOperation(active, "workspace-reports"),
    openConversation = useWorkspaceConversation();
  const [feedback, setFeedback] = useState<{ scope: string; message: string }>();
  const ids = mappings.map((m) => m.researchConversationId).sort();
  const activeJobScopes = [
    ...new Set(
      jobs
        .filter(
          (j) => j.scope.actorId === actorId && ids.includes(j.scope.conversationId),
        )
        .map((j) => j.scope.conversationId),
    ),
  ];
  const available = !!window.electronAPI?.listDesktopReports && !!actorId;
  const read = useResearchRead(
    async () => {
      const startGeneration = useResearchStore.getState().generation,
        startActor = actorId;
      const reports: (DesktopReportArtifact & { conversationId: string })[] = [];
      for (let offset = 0; offset < ids.length; offset += 5) {
        const batch = await Promise.all(
          ids.slice(offset, offset + 5).map(async (conversationId) => {
            if (
              useResearchStore.getState().actor?.member.id !== startActor ||
              useResearchStore.getState().generation !== startGeneration
            )
              throw new Error("账号已切换，已停止读取报告。");
            const stillAuthorized = useResearchStore
              .getState()
              .mappings.some((m) => m.researchConversationId === conversationId);
            if (!stillAuthorized) return [];
            return (
              await window.electronAPI!.listDesktopReports({
                actorId: startActor!,
                conversationId,
              })
            ).map((r) => ({ ...r, conversationId }));
          }),
        );
        reports.push(...batch.flat());
      }
      return reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    `workspace-native-reports:${actorId}:${ids.join(",")}`,
    active && available,
  );
  const act = async (
    report: DesktopReportArtifact & { conversationId: string },
    action: "open" | "chat",
  ) => {
    const { isCurrent } = operation.capture();
    const authorized = () =>
      isCurrent() &&
      useResearchStore
        .getState()
        .mappings.some((m) => m.researchConversationId === report.conversationId);
    if (!authorized() || !actorId) return;
    try {
      if (action === "open")
        await window.electronAPI!.openDesktopReport(
          { actorId, conversationId: report.conversationId },
          report.id,
        );
      else await openConversation(report.conversationId, authorized);
    } catch (error) {
      if (authorized())
        setFeedback({
          scope: operation.scope,
          message:
            error instanceof Error
              ? error.message.replace(/^.*DESKTOP_REPORT_[A-Z_]+:\s*/, "")
              : "暂未能打开，请稍后重试。",
        });
    }
  };
  return (
    <section className="workspace-reports">
      <h2>本机报告</h2>
      <p className="workspace-muted">
        本机保存的文件任务结果，只读取你当前获准聊天中的报告。报告不会上传到服务器。
      </p>
      {!available && (
        <p className="workspace-muted mt-6">
          Windows 桌面客户端可以在这里查看本机报告。
        </p>
      )}
      {read.error && (
        <Alert
          type="error"
          message={read.error}
          action={<Button onClick={read.refresh}>重试</Button>}
        />
      )}
      {feedback?.scope === operation.scope && (
        <Alert type="warning" message={feedback.message} />
      )}
      {!!actorId &&
        activeJobScopes.map((conversationId) => (
          <div key={conversationId} className="mt-4">
            <DesktopWorkCard scope={{ actorId, conversationId }} variant="chat" />
          </div>
        ))}
      {available && !read.data && !read.error && (
        <p role="status" className="mt-6">
          正在读取本机报告…
        </p>
      )}
      {read.data?.map((report) => (
        <article
          className="workspace-report-row"
          key={`${report.conversationId}:${report.id}`}
        >
          <div>
            <h3>{report.title}</h3>
            <p>{new Date(report.createdAt).toLocaleString("zh-CN")}</p>
          </div>
          <Button onClick={() => void act(report, "open")}>打开报告</Button>
          <Button type="text" onClick={() => void act(report, "chat")}>
            返回聊天
          </Button>
        </article>
      ))}
      {read.data && !read.data.length && (
        <div className="workspace-empty">
          <h2>还没有保存的报告</h2>
          <p>在 Agent 聊天中完成本地文件任务后，保存的报告会出现在这里。</p>
        </div>
      )}
    </section>
  );
}
