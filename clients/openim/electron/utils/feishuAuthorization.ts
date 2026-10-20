/** Only the server's read-only Feishu OAuth entry may leave the desktop app. */
export function validateFeishuAuthorizationUrl(value: unknown, service?: string) {
  const invalid = () => new Error("飞书授权链接无效，请重新连接飞书。");
  if (typeof value !== "string" || value.length > 8192) throw invalid();
  try {
    const url = new URL(value),
      query = url.searchParams;
    const keys = Array.from(query.keys());
    const callback = new URL(query.get("redirect_uri") || "");
    const scopes = (query.get("scope") || "").split(" ").sort().join(" ");
    if (
      keys.length !== 7 ||
      new Set(keys).size !== keys.length ||
      keys.some(
        (key) =>
          ![
            "client_id",
            "response_type",
            "redirect_uri",
            "state",
            "scope",
            "code_challenge",
            "code_challenge_method",
          ].includes(key),
      ) ||
      url.origin !== "https://accounts.feishu.cn" ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname !== "/open-apis/authen/v1/authorize" ||
      !/^cli_[A-Za-z0-9]+$/.test(query.get("client_id") || "") ||
      query.get("response_type") !== "code" ||
      query.get("code_challenge_method") !== "S256" ||
      !/^[A-Za-z0-9_-]{43}$/.test(query.get("state") || "") ||
      !/^[A-Za-z0-9_-]{43}$/.test(query.get("code_challenge") || "") ||
      scopes !==
        "contact:user.base:readonly docx:document:readonly wiki:wiki:readonly" ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash ||
      callback.pathname !== "/api/v1/feishu/callback" ||
      !(
        callback.protocol === "https:" ||
        (callback.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname))
      ) ||
      (service && callback.origin !== new URL(service).origin)
    )
      throw invalid();
    return url.href;
  } catch {
    throw invalid();
  }
}
