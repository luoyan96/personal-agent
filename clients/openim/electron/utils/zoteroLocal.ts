import { request } from "node:http";
import type {
  ZoteroCollection,
  ZoteroItem,
  ZoteroPage,
  ZoteroReadRequest,
} from "../../src/types/zotero";

const maxBytes = 2 * 1024 * 1024;
const keyPattern = /^[A-Z0-9]{8}$/;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Zotero 返回的记录格式无效。");
  return value as Record<string, unknown>;
};
function text(value: unknown, limit: number) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > limit)
    throw Error("Zotero 字段过长或格式无效，未截断导入。");
  return value.replace(/\u0000/g, "");
}
function itemKey(value: unknown) {
  if (typeof value !== "string" || !keyPattern.test(value))
    throw Error("Zotero 条目标识无效。");
  return value;
}
export function zoteroReadPath(value: unknown) {
  const input = record(value);
  if (
    !Number.isInteger(input.start) ||
    Number(input.start) < 0 ||
    Number(input.start) > 5000 ||
    Number(input.start) % 25
  )
    throw Error("Zotero 分页位置无效。");
  const start = Number(input.start);
  const params = new URLSearchParams({
    format: "json",
    limit: "25",
    start: String(start),
  });
  if (
    input.kind === "collections" &&
    Object.keys(input).every((k) => ["kind", "start"].includes(k))
  )
    return {
      path: `/api/users/0/collections?${params}`,
      start,
      kind: "collections" as const,
    };
  if (
    input.kind !== "items" ||
    !Object.keys(input).every((k) =>
      ["kind", "start", "collectionKey", "query"].includes(k),
    )
  )
    throw Error("不支持的 Zotero 读取请求。");
  const query = text(input.query, 200).trim();
  if (typeof input.collectionKey !== "string") throw Error("请选择 Zotero 集合。");
  const collection = input.collectionKey
    ? `collections/${itemKey(input.collectionKey)}/`
    : "";
  if (query) params.set("q", query);
  params.set("qmode", "titleCreatorYear");
  params.set("sort", "title");
  params.set("direction", "asc");
  return {
    path: `/api/users/0/${collection}items/top?${params}`,
    start,
    kind: "items" as const,
  };
}
/** Fixed loopback endpoint; no renderer URL, proxy, cookies, keys or redirects. */
export function readZoteroJson(
  path: string,
  signal: AbortSignal,
  serverId?: string | null,
): Promise<{ value: unknown; serverId: string | null; total: number | null }> {
  if (!path.startsWith("/api/") || /[\r\n]/.test(path))
    return Promise.reject(Error("无效 Zotero 路径。"));
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Zotero-API-Version": "3",
    };
    if (serverId) headers["Zotero-Server-ID"] = serverId;
    const req = request(
      { hostname: "127.0.0.1", port: 23119, method: "GET", path, headers, signal },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            Error(
              res.statusCode === 403
                ? "请在 Zotero 设置 → 高级中允许其他应用访问本机 Zotero。"
                : res.statusCode === 412
                ? "Zotero 文献库已切换，请断开后重新连接。"
                : `Zotero 读取失败（${res.statusCode ?? "无状态"}），未当作空结果。`,
            ),
          );
          return;
        }
        const current = res.headers["zotero-server-id"];
        const currentId = typeof current === "string" ? current : null;
        if (
          res.headers["zotero-api-version"] !== "3" ||
          !String(res.headers["content-type"]).includes("application/json") ||
          (serverId && currentId !== serverId) ||
          (currentId && !/^[A-Za-z0-9_-]{1,128}$/.test(currentId))
        ) {
          res.resume();
          reject(Error("本机响应不是受支持的 Zotero API，或文献库已切换。"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(Error("Zotero 响应超过 2 MiB，未截断读取。请缩小集合或关键词。"));
          } else chunks.push(chunk);
        });
        res.on("error", () => reject(Error("Zotero 响应中断，请重试。")));
        res.on("end", () => {
          if (size > maxBytes) return;
          try {
            const totalHeader = res.headers["total-results"];
            resolve({
              value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
              serverId: currentId,
              total:
                typeof totalHeader === "string" && /^\d{1,8}$/.test(totalHeader)
                  ? Number(totalHeader)
                  : null,
            });
          } catch {
            reject(Error("Zotero 返回了无效 JSON，未当作空结果。"));
          }
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(Error("Zotero 读取超过 10 秒，请检查本机 Zotero 后重试。")),
      10000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", (error) =>
      reject(
        Error(
          signal.aborted
            ? "本次 Zotero 读取已停止。"
            : error.message.includes("10 秒")
            ? error.message
            : "无法连接本机 Zotero，请打开 Zotero 并启用本地 API 后重试。",
        ),
      ),
    );
    req.end();
  });
}
export function zoteroPage(
  value: unknown,
  request: ZoteroReadRequest,
  total: number | null,
): ZoteroPage<ZoteroCollection | ZoteroItem> {
  if (!Array.isArray(value) || value.length > 25)
    throw Error("Zotero 返回的分页格式无效，未当作空结果。");
  const seen = new Set<string>();
  const items = value.flatMap<ZoteroCollection | ZoteroItem>((raw) => {
    const r = record(raw),
      data = record(r.data),
      key = itemKey(r.key);
    if (seen.has(key)) throw Error("Zotero 同页返回重复条目，请重试。");
    seen.add(key);
    if (request.kind === "collections")
      return [{ key, name: text(data.name, 500) || "未命名集合" }];
    if (["attachment", "note", "annotation"].includes(String(data.itemType))) return [];
    if (
      typeof data.itemType !== "string" ||
      !Number.isInteger(r.version) ||
      Number(r.version) < 0
    )
      throw Error("Zotero 文献类型或版本无效。");
    const creators = data.creators ?? [];
    if (!Array.isArray(creators) || creators.length > 100)
      throw Error("Zotero 作者字段格式无效，未截断导入。");
    const authors = creators
      .map((c) => {
        const a = record(c);
        return (
          text(a.name, 500) ||
          [text(a.firstName, 250), text(a.lastName, 250)].filter(Boolean).join(" ")
        );
      })
      .filter(Boolean);
    return [
      {
        key,
        version: Number(r.version),
        title: text(data.title, 2000) || "未命名文献",
        authors,
        date: text(data.date, 300),
        publication: text(data.publicationTitle, 2000),
        doi: text(data.DOI, 500),
        url: text(data.url, 2000),
        abstract: text(data.abstractNote, 50000),
      },
    ];
  });
  return {
    items,
    start: request.start,
    hasMore:
      total === null ? value.length === 25 : request.start + value.length < total,
  };
}
