import { ErrorResponse } from "@research-agent-platform/contracts";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { ResearchApiError } from "./api";
import { assertRequestActive, withRequestDeadline } from "./request-deadline";

export const researchScopeLabels = {
  owner_private: "仅自己",
  task_scoped: "任务授权",
  lab_shared: "课题组",
  public: "公开",
} as const;

export type ResearchFileVersion =
  ResponseFor<"researchFile">["data"]["versions"][number];

export async function readResearchFileBytes(
  id: string,
  version: ResearchFileVersion,
  signal?: AbortSignal,
) {
  return withRequestDeadline(
    async (requestSignal) => {
      const response = await fetch(
        `/api/v1/research-library/files/${encodeURIComponent(id)}/content?version=${
          version.version
        }`,
        { credentials: "same-origin", signal: requestSignal },
      );
      assertRequestActive(requestSignal);
      if (!response.ok) {
        const value = await response.json().catch(() => null);
        const error = ErrorResponse.safeParse(value);
        throw new ResearchApiError(
          error.success ? error.data.error.code : "HTTP_ERROR",
          response.status,
          response.status === 401
            ? "登录已失效，请重新登录后下载。"
            : response.status === 403 || response.status === 404
            ? "当前未获准下载此资料，请刷新后核对权限。"
            : "原始文件下载失败，请检查连接后重试。",
        );
      }
      const invalid = () =>
        new Error("原件响应与此版本不符，未保存文件。请重新读取来源后重试。");
      const mismatch = () =>
        new Error("原件大小或校验值与此版本不一致，未保存文件。请重新读取来源后重试。");
      const mediaType = response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();
      const length = response.headers.get("content-length");
      if (
        mediaType !== version.mediaType.toLowerCase() ||
        (length !== null &&
          (!/^\d+$/.test(length) || Number(length) > 10 * 1024 * 1024)) ||
        !response.body
      ) {
        await response.body?.cancel();
        throw invalid();
      }
      const reader = response.body.getReader();
      const cancel = () => {
        void reader.cancel().catch(() => {});
      };
      requestSignal.addEventListener("abort", cancel, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          assertRequestActive(requestSignal);
          const part = await reader.read();
          assertRequestActive(requestSignal);
          if (part.done) break;
          size += part.value.byteLength;
          if (size > version.byteLength || size > 10 * 1024 * 1024) throw mismatch();
          chunks.push(part.value);
        }
        if (size !== version.byteLength) throw mismatch();
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        assertRequestActive(requestSignal);
        const hash = Array.from(new Uint8Array(digest), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
        if (hash !== version.sha256) throw mismatch();
        return new Blob([bytes], { type: version.mediaType });
      } catch (error) {
        cancel();
        throw error;
      } finally {
        requestSignal.removeEventListener("abort", cancel);
        reader.releaseLock();
      }
    },
    30000,
    signal,
  );
}

export function fileAsBase64(file: File): Promise<string> {
  if (!file.size || file.size > 10 * 1024 * 1024)
    return Promise.reject(new Error("请选择非空且不超过 10 MiB 的文件。"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("本机文件读取失败，请重新选择文件。"));
    reader.readAsDataURL(file);
  });
}

export function researchFileMediaType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    csv: "text/csv",
    pdf: "application/pdf",
  };
  return types[extension || ""] || file.type || "application/octet-stream";
}
