export function validateResearchServiceUrl(address: unknown): string {
  if (typeof address !== "string" || !address.trim())
    throw new Error("请填写科研微信服务地址");
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new Error("请填写完整地址，例如 https://你的实验室域名");
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error("服务地址不能包含账号、密码、查询参数或片段");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error("请使用可信的 HTTPS 服务地址；本机开发允许 localhost 或 127.0.0.1");
  return url.href;
}
