import "./workspace.scss";
import "./library-workspace.scss";

import { Button, Segmented, Spin } from "antd";
import {
  FileTextOutlined,
  FolderOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";

import { LabStandards } from "./LabStandards";
import { LibraryIndexPage } from "./LibraryIndexPage";
import { PersonalFilesPage } from "./PersonalFilesPage";
import { ResearchLibrary } from "./ResearchLibrary";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceReports } from "./WorkspaceReports";
import { TeamLibraryWorkspace } from "./TeamLibraryWorkspace";
import "./record-workspace.scss";

const librarySections = [
  { key: "team", label: "团队资料", Icon: FolderOutlined },
  { key: "mine", label: "我的资料", Icon: FolderOutlined },
  { key: "index", label: "课题组文件索引", Icon: FileTextOutlined },
  { key: "standards", label: "课题组规范", Icon: SafetyCertificateOutlined },
  { key: "templates", label: "模板与方法", Icon: ReadOutlined },
  { key: "reports", label: "本机报告", Icon: FileTextOutlined },
  { key: "collections", label: "共享原件", Icon: FolderOutlined },
];

export function LibraryWorkspace() {
  const [params, setParams] = useSearchParams();
  // The standards page needs its own routes, so the tab only appears once the
  // server can answer for it; older servers keep the plain library.
  const availability = useWorkspaceAvailability(true);
  const standardsReady = availability.supports(40);
  const indexReady = availability.supports(41);
  const reports = params.get("panel") === "reports";
  const standards = params.get("panel") === "standards" && standardsReady;
  const index = params.get("panel") === "index" && indexReady;
  const mine = !params.has("panel") && params.get("scope") === "mine";
  const openSection = (key: string) => {
    const next = new URLSearchParams();
    if (key === "mine") next.set("scope", "mine");
    else if (key === "templates") {
      next.set("panel", "standards");
      next.set("section", "templates");
    } else if (key !== "team") next.set("panel", key);
    setParams(next);
  };
  // Unknown compatibility is not an old server. Do not mount the legacy
  // library (and its Agent) while the first health read is still pending.
  if (!availability.version && !reports && !mine)
    return (
      <main className="social-workspace workspace-library">
        <header className="workspace-heading">
          <h1>资料</h1>
        </header>
        <section
          className="library-workspace-availability"
          role={availability.error ? "alert" : "status"}
        >
          {availability.error ? (
            <>
              <p>暂时无法确认资料服务</p>
              <p>{availability.error}</p>
              <Button onClick={() => void availability.refresh()}>重新检查</Button>
            </>
          ) : (
            <>
              <Spin />
              <p>正在确认资料服务…</p>
            </>
          )}
          <Button onClick={() => openSection("mine")}>我的资料</Button>
        </section>
      </main>
    );
  if (availability.supports(44) || (!availability.version && mine)) {
    const active = reports
      ? "reports"
      : standards
      ? ["templates", "methods"].includes(params.get("section") || "")
        ? "templates"
        : "standards"
      : index
      ? "index"
      : params.get("panel") === "collections"
      ? "collections"
      : mine
      ? "mine"
      : "team";
    const sections = availability.version
      ? librarySections
      : librarySections.filter(({ key }) => ["team", "mine", "reports"].includes(key));
    return (
      <main className="social-workspace workspace-library library-page-shell">
        <aside className="library-section-sidebar">
          <h1>资料</h1>
          <nav className="library-section-nav" aria-label="资料导航">
            {sections.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-current={active === key ? "page" : undefined}
                onClick={() => openSection(key)}
              >
                <Icon />
                {label}
              </button>
            ))}
          </nav>
          <select
            className="library-section-switcher"
            aria-label="资料栏目"
            value={active}
            onChange={(event) => openSection(event.target.value)}
          >
            {sections.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </aside>
        <div className="library-section-body">
          {reports ? (
            <div className="library-workspace-content">
              <WorkspaceReports active />
            </div>
          ) : standards ? (
            <LabStandards />
          ) : mine ? (
            <div className="library-workspace-content">
              <PersonalFilesPage />
            </div>
          ) : index ? (
            <div className="library-workspace-content">
              <LibraryIndexPage />
            </div>
          ) : params.get("panel") === "collections" ? (
            <div className="library-workspace-content">
              <ResearchLibrary />
            </div>
          ) : (
            <TeamLibraryWorkspace supported />
          )}
        </div>
      </main>
    );
  }
  return (
    <main className="social-workspace workspace-library">
      <header className="workspace-heading">
        <div>
          <h1>资料</h1>
        </div>
      </header>
      <div className="workspace-toolbar">
        <Segmented
          aria-label="资料栏目"
          value={
            reports
              ? "reports"
              : standards
              ? "standards"
              : index
              ? "index"
              : mine
              ? "mine"
              : "collections"
          }
          options={[
            { label: "资料库", value: "collections" },
            { label: "我的资料", value: "mine" },
            ...(indexReady ? [{ label: "课题组文件索引", value: "index" }] : []),
            ...(standardsReady ? [{ label: "课题组规范", value: "standards" }] : []),
            { label: "本机报告", value: "reports" },
          ]}
          onChange={(value) => openSection(String(value))}
        />
      </div>
      <div className={`library-workspace-content ${reports ? "is-reports" : ""}`}>
        {reports ? (
          <WorkspaceReports active />
        ) : standards ? (
          <LabStandards />
        ) : index ? (
          <LibraryIndexPage />
        ) : mine ? (
          <PersonalFilesPage />
        ) : (
          <ResearchLibrary />
        )}
      </div>
    </main>
  );
}
