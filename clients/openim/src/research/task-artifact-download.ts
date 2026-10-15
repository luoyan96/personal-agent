import type { ResponseFor } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { assertRequestActive } from "./request-deadline";

export type TaskArtifact = ResponseFor<"artifact">["data"];

export async function readTaskArtifact(artifact: TaskArtifact, signal: AbortSignal) {
  if (artifact.accessStatus === "revoked") throw new Error("此材料已撤回，不能下载。");
  const bytes = await researchApi("content", { params: { id: artifact.id }, signal });
  assertRequestActive(signal);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  assertRequestActive(signal);
  const hash = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  if (bytes.byteLength !== artifact.size || hash !== artifact.sha256)
    throw new Error(
      "材料大小或校验值与此版本不一致，未保存文件。请重新读取任务后重试。",
    );
  return new Blob([bytes], { type: artifact.mediaType });
}

export function saveTaskArtifact(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "") ||
    "科研材料";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
