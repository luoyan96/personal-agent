import { Segmented } from "antd";
import { useSearchParams } from "react-router-dom";
import { PersonalFollowupPanel } from "./PersonalFollowupPanel";
import { TaskPlanning } from "./TaskPlanning";
import { ResearchLibrary } from "./ResearchLibrary";
import { WorkspaceReports } from "./WorkspaceReports";
import type { PlanningPreset } from "./planning-presets";

export function WorkbenchPlanning({
  launch,
  preset,
  onTasks,
}: {
  launch: number;
  preset?: PlanningPreset;
  onTasks: (taskId?: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const scheduled = params.get("panel") === "scheduled";
  return (
    <div className="workspace-group-panel">
      {scheduled ? (
        <div className="workspace-full-panel">
          <PersonalFollowupPanel active />
        </div>
      ) : (
        <TaskPlanning launch={launch} preset={preset} onTasks={onTasks} />
      )}
    </div>
  );
}

export function WorkbenchLibrary() {
  const [params, setParams] = useSearchParams();
  const reports = params.get("panel") === "reports";
  return (
    <div className="workspace-group-panel">
      <div className="workspace-subnavigation">
        <Segmented
          aria-label="资料与素材栏目"
          value={reports ? "reports" : "collections"}
          options={[
            { label: "资料集合", value: "collections" },
            { label: "本机报告", value: "reports" },
          ]}
          onChange={(value) =>
            setParams(
              value === "reports"
                ? { view: "library", panel: "reports" }
                : { view: "library" },
            )
          }
        />
      </div>
      <div className="workspace-full-panel research-library-panel">
        {reports ? <WorkspaceReports active /> : <ResearchLibrary />}
      </div>
    </div>
  );
}
