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
import { ResearchLibrary } from "./ResearchLibrary";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceReports } from "./WorkspaceReports";
import { TeamLibraryWorkspace } from "./TeamLibraryWorkspace";
import "./record-workspace.scss";

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
  // Unknown compatibility is not an old server. Do not mount the legacy
  // library (and its Agent) while the first health read is still pending.
  // Local reports remain usable without waiting for the backend.
  if (!availability.version && !reports)
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
        </section>
      </main>
    );
  if (availability.supports(44))
    return (
      <main className="social-workspace workspace-library library-page-shell">
        <nav className="library-section-nav" aria-label="资料导航">
          <h1>资料</h1>
          {[
            { key: "team", label: "团队资料", icon: <FolderOutlined /> },
            { key: "mine", label: "我的资料", icon: <FolderOutlined /> },
            {
              key: "standards",
              label: "课题组规范",
              icon: <SafetyCertificateOutlined />,
            },
            { key: "templates", label: "模板与方法", icon: <ReadOutlined /> },
            { key: "reports", label: "本机报告", icon: <FileTextOutlined /> },
            { key: "collections", label: "共享原件", icon: <FolderOutlined /> },
          ].map(({ key, label, icon }) => {
            const active = reports
              ? "reports"
              : standards
              ? ["templates", "methods"].includes(params.get("section") || "")
                ? "templates"
                : "standards"
              : index
              ? "mine"
              : params.get("panel") === "collections"
              ? "collections"
              : params.get("scope") === "mine"
              ? "mine"
              : "team";
            return (
              <button
                key={key}
                aria-current={active === key ? "page" : undefined}
                onClick={() => {
                  const next = new URLSearchParams();
                  if (key === "mine") next.set("scope", "mine");
                  else if (key === "templates") {
                    next.set("panel", "standards");
                    next.set("section", "templates");
                  } else if (key !== "team") next.set("panel", key);
                  setParams(next);
                }}
              >
                {icon}
                {label}
              </button>
            );
          })}
        </nav>
        <div className="library-section-body">
          {reports ? (
            <div className="library-workspace-content">
              <WorkspaceReports active />
            </div>
          ) : standards ? (
            <LabStandards />
          ) : index || params.get("scope") === "mine" ? (
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
              : "collections"
          }
          options={[
            { label: "资料库", value: "collections" },
            ...(indexReady ? [{ label: "资料索引", value: "index" }] : []),
            ...(standardsReady ? [{ label: "课题组规范", value: "standards" }] : []),
            { label: "本机报告", value: "reports" },
          ]}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            // Old "peers" links fall back to the library instead of a blank tab.
            if (value === "reports" || value === "standards" || value === "index")
              next.set("panel", value);
            else next.delete("panel");
            setParams(next);
          }}
        />
      </div>
      <div className={`library-workspace-content ${reports ? "is-reports" : ""}`}>
        {reports ? (
          <WorkspaceReports active />
        ) : standards ? (
          <LabStandards />
        ) : index ? (
          <LibraryIndexPage />
        ) : (
          <ResearchLibrary />
        )}
      </div>
    </main>
  );
}
