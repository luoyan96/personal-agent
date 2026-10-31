import "./workspace.scss";
import "./library-workspace.scss";

import { Segmented } from "antd";
import { useSearchParams } from "react-router-dom";

import { LabStandards } from "./LabStandards";
import { PeerLibraryPanel } from "./PeerLibraryPanel";
import { ResearchLibrary } from "./ResearchLibrary";
import { WorkspaceReports } from "./WorkspaceReports";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";

export function LibraryWorkspace() {
  const [params, setParams] = useSearchParams();
  // The standards page needs its own routes, so the tab only appears once the
  // server can answer for it; older servers keep the three-tab library.
  const availability = useWorkspaceAvailability(true);
  const standardsReady = availability.supports(40);
  const reports = params.get("panel") === "reports";
  const peers = params.get("panel") === "peers";
  const standards = params.get("panel") === "standards" && standardsReady;
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
            peers
              ? "peers"
              : reports
              ? "reports"
              : standards
              ? "standards"
              : "collections"
          }
          options={[
            { label: "资料库", value: "collections" },
            ...(standardsReady ? [{ label: "课题组规范", value: "standards" }] : []),
            { label: "本机报告", value: "reports" },
            { label: "同事资料", value: "peers" },
          ]}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            if (value === "reports" || value === "peers" || value === "standards")
              next.set("panel", value);
            else next.delete("panel");
            setParams(next);
          }}
        />
      </div>
      <div className={`library-workspace-content ${reports ? "is-reports" : ""}`}>
        {peers ? (
          <PeerLibraryPanel />
        ) : reports ? (
          <WorkspaceReports active />
        ) : standards ? (
          <LabStandards />
        ) : (
          <ResearchLibrary />
        )}
      </div>
    </main>
  );
}
