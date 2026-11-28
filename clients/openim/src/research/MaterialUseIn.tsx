import { Alert, Button, Dropdown } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { WorkbenchUseSource, WorkbenchUseTarget } from "@/types/dshWorkbenchMaterials";
import { usePersonalOperation } from "./usePersonalOperation";

const targets: { key: WorkbenchUseTarget; label: string }[] = [
  { key: "group-meeting", label: "新建组会 PPT" },
  { key: "existing-document", label: "加入已有 Word 项目" },
  { key: "existing-paper", label: "加入已有 LaTeX 项目" },
];

const empty = new Set<string>();
export function useMaterialSelection(scope: string) {
  const [selection, setSelection] = useState<{ scope: string; paths: Set<string> }>();
  const paths = selection?.scope === scope ? selection.paths : empty;
  const toggle = (path: string, checked: boolean) => setSelection((previous) => {
    const next = new Set(previous?.scope === scope ? previous.paths : []);
    if (checked && next.size < 10) next.add(path);
    if (!checked) next.delete(path);
    return { scope, paths: next };
  });
  return { paths, toggle };
}

export function MaterialUseIn({ source, busy }: { source: WorkbenchUseSource; busy?: boolean }) {
  const navigate = useNavigate();
  const operation = usePersonalOperation(true, "material-use-in");
  const [status, setStatus] = useState<{ scope: string; error?: string }>();
  const stage = window.electronAPI?.localDsh?.stageMaterialUseIn;
  const count = source.source === "personal" ? source.files.length : source.paths.length;
  const current = status?.scope === operation.scope ? status : undefined;
  const working = current !== undefined && current.error === undefined;
  const useIn = async (target: WorkbenchUseTarget) => {
    const { isCurrent } = operation.capture();
    if (!stage || !isCurrent() || !count || working) return;
    setStatus({ scope: operation.scope });
    try {
      await stage(target, source);
      if (isCurrent()) navigate("/dsh");
    } catch (error) {
      if (isCurrent()) setStatus({ scope: operation.scope, error: error instanceof Error
        ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "无法打开工作台，请重试。" });
    }
  };
  return (
    <div className="material-use-in">
      <Dropdown menu={{ items: targets, onClick: ({ key }) => void useIn(key as WorkbenchUseTarget) }} trigger={["click"]}>
        <Button disabled={!count || !stage || busy} loading={working} title={stage ? undefined : "请在 Windows 桌面客户端操作"}>
          用于…{count ? `（${count}）` : ""}
        </Button>
      </Dropdown>
      {current?.error && <Alert type="error" showIcon message={current.error} />}
    </div>
  );
}
