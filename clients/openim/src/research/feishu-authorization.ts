export async function openFeishuAuthorization(value: string) {
  // The native bridge validates the complete OAuth request against the current
  // service. The browser fallback only navigates to this fixed Feishu entry.
  let url: string;
  try {
    const target = new URL(value);
    if (
      target.origin !== "https://accounts.feishu.cn" ||
      target.pathname !== "/open-apis/authen/v1/authorize" ||
      target.username ||
      target.password ||
      target.hash
    )
      throw new Error();
    url = target.href;
  } catch {
    throw new Error("飞书授权链接无效，请重新连接飞书。");
  }
  if (window.electronAPI) {
    if (!window.electronAPI.openFeishuAuthorization)
      throw new Error("当前客户端无法打开授权页，请复制链接到浏览器，或更新客户端。");
    try {
      await window.electronAPI.openFeishuAuthorization(url);
    } catch {
      throw new Error(
        "未能打开系统浏览器。请点击“复制授权链接”，粘贴到 Edge 或其他浏览器的地址栏。",
      );
    }
    return;
  }
  // Open synchronously from the button gesture; API preparation has already
  // completed. Clear the opener before navigating to the external page.
  const page = window.open("about:blank", "_blank");
  if (!page)
    throw new Error("浏览器阻止了授权窗口，请允许弹出窗口，或复制授权链接打开。");
  try {
    page.opener = null;
    page.location.replace(url);
  } catch {
    page.close();
    throw new Error("未能打开授权页，请复制授权链接到浏览器。");
  }
}
