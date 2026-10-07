import { FileTextOutlined, LoadingOutlined } from "@ant-design/icons";
import { Alert, Button, Modal, Progress } from "antd";
import { useEffect, useState } from "react";
import type { DesktopReportArtifact, DesktopReportScope } from "@/types/desktopWork";
import { activeDesktopWork, stopDesktopWork, useDesktopWork } from "./desktop-work";

const labels = { reading: "读取所选文件", analysing: "逐文件分析", synthesising: "汇总结果",
  saving: "保存报告", succeeded: "报告已保存", failed: "任务未完成", cancelled: "任务已停止" };
export default function DesktopWorkCard({ scope }: { scope: DesktopReportScope }) {
  const jobs = useDesktopWork(s => s.jobs);
  const related = jobs.filter(j => j.scope.actorId === scope.actorId && j.scope.conversationId === scope.conversationId);
  const latest = related[related.length - 1];
  const [open, setOpen] = useState(false), [reports, setReports] = useState<DesktopReportArtifact[]>([]);
  const [error, setError] = useState("");
  const key = `${scope.actorId}:${scope.conversationId}`;
  useEffect(() => {
    setOpen(false); setError(""); setReports([]);
  }, [key]);
  useEffect(() => {
    let current = true;
    void window.electronAPI?.listDesktopReports(scope).then(r => { if (current) setReports(r); })
      .catch(() => { if (current) setError("暂时无法读取本机报告。"); });
    return () => { current = false; };
  }, [key, latest?.artifact?.id]);
  const show = async () => {
    setOpen(true); setError("");
    try { setReports(await window.electronAPI!.listDesktopReports(scope)); }
    catch (e) { setError(e instanceof Error ? e.message : "报告读取失败"); }
  };
  const openReport = async (report: DesktopReportArtifact, reveal = false) => {
    try {
      if (reveal) await window.electronAPI!.revealDesktopReport(scope, report.id);
      else await window.electronAPI!.openDesktopReport(scope, report.id);
    } catch (e) { setError(e instanceof Error ? e.message : "报告无法打开"); }
  };
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
        {job.error && <p className="mt-1 text-sm text-amber-800">{job.error}</p>}
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
