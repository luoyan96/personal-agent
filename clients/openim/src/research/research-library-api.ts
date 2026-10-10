import { ErrorResponse } from "@research-agent-platform/contracts";
import { ResearchApiError } from "./api";
import { withRequestDeadline } from "./request-deadline";

export const researchScopeLabels = {
  owner_private: "仅自己",
  task_scoped: "任务授权",
  lab_shared: "课题组",
  public: "公开",
} as const;

export async function readResearchFileBytes(id: string, version: number) {
  return withRequestDeadline(async (signal) => {
    const response = await fetch(`/api/v1/research-library/files/${encodeURIComponent(id)}/content?version=${version}`, { credentials: "same-origin", signal });
    if (!response.ok) {
      const value = await response.json().catch(() => null);
      const error = ErrorResponse.safeParse(value);
      throw new ResearchApiError(error.success ? error.data.error.code : "HTTP_ERROR", response.status,
        response.status === 403 || response.status === 404 ? "当前未获准下载此资料，请刷新后核对权限。" : "原始文件下载失败，请检查连接后重试。");
    }
    return response.blob();
  }, 30000);
}

export function fileAsBase64(file: File): Promise<string> {
  if (!file.size || file.size > 10 * 1024 * 1024) return Promise.reject(new Error("请选择非空且不超过 10 MiB 的文件。"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("本机文件读取失败，请重新选择文件。"));
    reader.readAsDataURL(file);
  });
}

export function researchFileMediaType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = { md: "text/markdown", txt: "text/plain", csv: "text/csv", pdf: "application/pdf" };
  return types[extension || ""] || file.type || "application/octet-stream";
}
