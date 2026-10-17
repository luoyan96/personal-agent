import { Id, type Contact } from "@research-agent-platform/contracts";

const prefix = "acceptcat-card:v1:";

export function contactServiceOrigin(address: string): string {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new Error("名片服务地址不可用，请核对当前连接。");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  )
    throw new Error("名片服务地址不可用，请核对当前连接。");
  return url.origin;
}

/** Desktop rendering uses a temporary loopback origin, never the service identity. */
export async function readContactServiceOrigin(): Promise<string> {
  if (window.electronAPI) {
    if (typeof window.electronAPI.getResearchServiceStatus !== "function")
      throw new Error("暂未读取服务地址，请连接服务后重试。");
    const status = await window.electronAPI.getResearchServiceStatus();
    if (!status.connected || !status.address)
      throw new Error("请先连接科研服务，再使用名片。");
    return contactServiceOrigin(status.address);
  }
  return contactServiceOrigin(window.location.origin);
}

export function makeContactCard(
  contact: Pick<Contact, "id" | "displayName" | "identity" | "username">,
  address: string,
): string {
  const origin = contactServiceOrigin(address);
  const id = Id.parse(contact.id);
  const human = contact.identity.kind === "human";
  const name = contact.displayName.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  return [
    `AcceptCat ${human ? "真人" : "Agent"}名片：${name}`,
    human && contact.username ? `AcceptCat 号：${contact.username}` : "",
    `服务：${origin}`,
    `${prefix}${encodeURIComponent(origin)}:${id}`,
    "打开 AcceptCat → 通讯录 → 添加，粘贴此名片后查找。",
  ]
    .filter(Boolean)
    .join("\n");
}

export type ContactLookup =
  | { kind: "account"; username: string }
  | { kind: "card"; origin: string; contactId: string };

/** Names and accompanying text are display only. Resolve identity from the server. */
export function parseContactLookup(raw: string): ContactLookup {
  const text = raw.trim();
  if (!text || text.length > 2048)
    throw new Error("请输入完整 AcceptCat 号，或粘贴一张完整名片。");
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const tokens = lines.filter((line) => line.startsWith("acceptcat-card:"));
  if (!tokens.length) {
    if (lines.length !== 1 || text.length > 100 || text.includes("://"))
      throw new Error(
        "请使用 AcceptCat 号或新版名片口令，旧版本机链接不能跨设备添加。",
      );
    return { kind: "account", username: text };
  }
  if (tokens.length !== 1) throw new Error("一次只能查找一张名片，请分别粘贴。");
  const token = tokens[0]!;
  if (!token.startsWith(prefix))
    throw new Error("暂不支持这个名片版本，请更新 AcceptCat 后重试。");
  const body = token.slice(prefix.length),
    split = body.lastIndexOf(":");
  try {
    const address = decodeURIComponent(body.slice(0, split));
    const url = new URL(address);
    if (split < 1 || url.pathname !== "/") throw Error();
    return {
      kind: "card",
      origin: contactServiceOrigin(address),
      contactId: Id.parse(body.slice(split + 1)),
    };
  } catch {
    throw new Error("名片口令不完整或已损坏，请让对方重新复制。");
  }
}

export function assertContactCardService(lookup: ContactLookup, current: string) {
  if (lookup.kind === "card" && lookup.origin !== contactServiceOrigin(current))
    throw new Error("名片与当前登录服务不一致，请核对后使用对应账号登录。");
}
