import { FileTextOutlined, LoadingOutlined } from "@ant-design/icons";
import { Alert, Button, Modal, Progress } from "antd";
import { useEffect, useState } from "react";
import type { DesktopReportArtifact, DesktopReportScope } from "@/types/desktopWork";
import { activeDesktopWork, stopDesktopWork, useDesktopWork } from "./desktop-work";

const labels = { reading: "读取所选文件", analysing: "逐文件分析", synthesising: "汇总结果",
  saving: "保存报告", succeeded: "报告已保存", failed: "任务未完成", cancelled: "任务已停止" };
const readableReportError = (error: unknown, fallback: string) => {
  const text = typeof error === "string" ? error : error instanceof Error ? error.message : fallback;
  return text.match(/DESKTOP_REPORT_[A-Z_]+:\s*(.+)/)?.[1] ||
    (text.startsWith("Error invoking remote method") ? fallback : text);
};
export default function DesktopWorkCard({ scope, variant = "toolbar" }: { scope: DesktopReportScope; variant?: "toolbar" | "chat" }) {
  const jobs = useDesktopWork(s => s.jobs);
  const related = jobs.filter(j => j.scope.actorId === scope.actorId && j.scope.conversationId === scope.conversationId);
  const latest = related[related.length - 1];
  const [open, setOpen] = useState(false), [reports, setReports] = useState<DesktopReportArtifact[]>([]);
  const [error, setError] = useState("");
  const key = `${scope.actorId}:${scope.conversationId}`;
  useEffect(() => {
    setOpen(false); setError(""); setReports([]);
  }, [key, latest?.id]);
  useEffect(() => {
    if (variant !== "toolbar") return;
    let current = true;
    void window.electronAPI?.listDesktopReports(scope).then(r => { if (current) setReports(r); })
      .catch(() => { if (current) setError("暂时无法读取本机报告。"); });
    return () => { current = false; };
  }, [key, latest?.artifact?.id, variant]);
  const show = async () => {
    setOpen(true); setError("");
    try { setReports(await window.electronAPI!.listDesktopReports(scope)); }
    catch (e) { setError(readableReportError(e, "暂时无法读取本机报告，请稍后重试。")); }
  };
  const openReport = async (report: DesktopReportArtifact, reveal = false) => {
    setError("");
    try {
      if (reveal) await window.electronAPI!.revealDesktopReport(scope, report.id);
      else await window.electronAPI!.openDesktopReport(scope, report.id);
    } catch (e) { setError(readableReportError(e, "报告暂时无法打开，请稍后重试。")); }
  };
  if (variant === "chat") {
    if (!latest) return null;
    const active = activeDesktopWork(latest);
    const percent = latest.phase === "succeeded" ? 100 : Math.min(99, Math.round(latest.completed / Math.max(1, latest.total) * 100));
    return <section className="desktop-work-card" data-desktop-work={latest.id} aria-label="文件任务进度">
      <div className="desktop-work-card-heading">
        <span className="desktop-work-icon"><FileTextOutlined /></span>
        <div className="desktop-work-card-title"><strong>{latest.title}</strong><span role="status">{labels[latest.phase]}</span></div>
        {active && <Button size="small" className="desktop-work-stop" onClick={() => stopDesktopWork(latest.id)}>停止</Button>}
        {latest.artifact && <Button size="small" type="primary" onClick={() => void openReport(latest.artifact!)}>打开报告</Button>}
      </div>
      <Progress percent={percent} showInfo={false} status={latest.phase === "failed" ? "exception" : latest.phase === "succeeded" ? "success" : "normal"} size="small" />
      <p className="desktop-work-step-count">{latest.phase === "succeeded" ? "分析已完成，报告已保存到本机" : `已完成 ${latest.completed} / ${latest.total} 步分析`}</p>
      {latest.currentFile && <p className="desktop-work-current-file" title={latest.currentFile}>{latest.currentFile}</p>}
      {latest.error && latest.error !== labels[latest.phase] && <p className="desktop-work-error" role="alert">{readableReportError(latest.error, "任务未完成，请在文件任务与报告中查看后重试。")}</p>}
      {error && <p className="desktop-work-error" role="alert">{error}</p>}
      <details className="desktop-work-details"><summary>查看详情</summary>
        <dl><div><dt>开始时间</dt><dd>{new Date(latest.startedAt).toLocaleString()}</dd></div><div><dt>分析进度</dt><dd>{latest.completed} / {latest.total} 步；长文件会分段，汇总时可能增加步骤。</dd></div>
          {latest.currentFile && <div><dt>当前范围</dt><dd>{latest.currentFile}</dd></div>}
        </dl>
        {latest.artifact && <Button size="small" onClick={() => void openReport(latest.artifact!, true)}>打开文件位置</Button>}
        <p>切换聊天可继续；退出软件会停止本地后续步骤，已保存的报告保留。</p>
      </details>
    </section>;
  }
  return <>
    <button type="button" onClick={() => void show()} className="inline-flex max-w-[320px] items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" aria-label="文件任务与报告">
      {latest && activeDesktopWork(latest) ? <LoadingOutlined /> : <FileTextOutlined />}
      <span className="truncate">{latest && activeDesktopWork(latest) ? `${labels[latest.phase]} · ${latest.completed}/${latest.total}` : `文件任务与报告${reports.length ? ` (${reports.length})` : ""}`}</span>
    </button>
    <Modal title="文件工作区" open={open} onCancel={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>返回聊天</Button>} width={620}>
      {error && <Alert type="error" message={error} className="mb-3" />}
      {related.slice().reverse().map(job => <section key={job.id} className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3"><strong>{job.title}</strong><span className="text-xs text-slate-500">{labels[job.phase]}</span></div>
        <Progress percent={job.phase === "succeeded" ? 100 : Math.round(job.completed / (job.total + 1) * 100)} status={job.phase === "failed" ? "exception" : job.phase === "succeeded" ? "success" : "normal"} size="small" />
        {job.currentFile && <p className="break-all text-sm text-slate-600">正在分析 {job.currentFile}</p>}
        {job.error && <p className="mt-1 text-sm text-amber-800">{readableReportError(job.error, "任务未完成，请稍后重试。")}</p>}
        {activeDesktopWork(job) && <Button size="small" onClick={() => stopDesktopWork(job.id)}>停止任务</Button>}
        {job.artifact && <Button size="small" type="primary" onClick={() => void openReport(job.artifact!)}>打开报告</Button>}
      </section>)}
      <h3 className="mb-2 font-medium">已保存到这台电脑</h3>
      {!reports.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">文件任务完成后，报告会保存在这里。关闭软件后仍可打开。</p>}
      {reports.map(report => <div key={report.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
        <div className="min-w-0"><p className="truncate font-medium">{report.title}</p><p className="text-xs text-slate-500">{new Date(report.createdAt).toLocaleString()}</p></div>
        <div className="flex shrink-0 gap-2"><Button size="small" onClick={() => void openReport(report)}>打开</Button><Button size="small" onClick={() => void openReport(report, true)}>文件位置</Button></div>
      </div>)}
      <p className="mt-3 text-xs leading-5 text-slate-500">任务在本机安排，模型通过你配置的在线服务处理文字。切换聊天可继续；退出软件会停止本地后续步骤，已经生成的聊天回复和报告保留。</p>
    </Modal>
  </>;
}
