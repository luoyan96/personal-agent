type ValidationIssue = { path: readonly PropertyKey[]; code?: string };

/** Show field guidance, never the Zod issue JSON or a submitted value. */
export function validationMessage(issues: readonly ValidationIssue[]): string {
  const field = issues[0]?.path.at(-1);
  if (field === "username")
    return "用户名需为 1–100 个字符，只能包含字母、数字、下划线和连字符。";
  if (field === "password") return "密码至少 8 个字符。";
  if (field === "inviteCode") return "请填写完整的实验室邀请码，并检查是否复制正确。";
  if (field === "displayName") return "请填写显示姓名，最多 200 个字符。";
  if (field === "filename") return "文件名需为 1–200 个字符，不能包含路径。";
  if (field === "mediaType") return "只支持含文字的 PDF、TXT、Markdown 和 CSV。";
  if (field === "contentBase64") return "文件内容或大小不符合读取要求，请选择不超过 10 MiB 的原文件。";
  if (field === "endpoint") return "请填写完整的 HTTPS chat/completions 接口地址；不支持 URL 中的账号、参数或非 443 端口。";
  if (field === "apiKey") return "API Key 至少 8 个字符，不会回显。";
  return "请检查必填内容、格式和长度后再试。";
}

const messages: Record<string, string> = {
  AGENT_LIMIT_REACHED: "个人 Agent 数量已达上限，请先整理已有 Agent。",
  EXTERNAL_CONSENT_REQUIRED: "请先明确授权将本条文字发送到外部服务。",
  EXTERNAL_FILES_UNSUPPORTED: "此 Agent 接入外部文字服务，只接收当前授权文字，不读取附件。",
  EXTERNAL_SCOPE_UNSUPPORTED: "外部 Agent 仅支持当前文字聊天，不支持历史、记忆或协作任务。",
  EXTERNAL_ENDPOINT_UNSAFE: "外部接口地址不符合安全连接要求，请核对 HTTPS 地址。",
  EXTERNAL_AUTH_FAILED: "外部服务拒绝了凭据，请让主人核对该服务的 API Key。",
  EXTERNAL_SERVICE_FAILED: "外部服务暂不可用，不会自动改用其他模型。",
  EXTERNAL_RESPONSE_INVALID: "外部服务返回内容无法读取，请让主人核对文字接口与模型。",
  EXTERNAL_TIMEOUT: "外部服务响应超时；请核对服务记录后再决定是否重新发送。",
  EXTERNAL_OUTCOME_UNCERTAIN: "外部请求结果尚未确认，不会自动重复请求，请核对服务记录。",
  UNAUTHENTICATED: "登录已失效，请重新登录。",
  FORBIDDEN: "你没有执行此操作的权限，请核对账号和当前授权。",
  NOT_FOUND: "内容不存在，或你已失去访问权限。",
  VALIDATION_ERROR: "请检查填写内容、格式和长度后再试。",
  VERSION_CONFLICT: "版本已变化，请重新读取并核对后再提交；填写已保留。",
  IDEMPOTENCY_CONFLICT: "这次请求与此前提交不一致，请核对内容后重新操作。",
  ALREADY_CLAIMED: "任务已被其他成员承接，请刷新后查看。",
  DEPENDENCY_BLOCKED: "前置任务尚未满足要求，请查看任务依赖。",
  CAPABILITY_UNAVAILABLE: "当前能力不可用，请重新选择获准的能力。",
  MODEL_UNAVAILABLE: "模型暂不可用，请在模型设置中检查你的配置。",
  CURSOR_EXPIRED: "列表已变化，请刷新后重新查看。",
  SERVICE_UNAVAILABLE: "服务暂不可用，请稍后重试。",
  NOT_IMPLEMENTED: "此功能暂未开放。",
  PAYLOAD_TOO_LARGE: "提交内容过大，请减少内容或附件大小。",
  RATE_LIMITED: "操作较频繁，请稍后再试。",
  INVALID_STATE: "当前状态不能执行此操作，请刷新后核对。",
  INTERNAL_ERROR: "服务处理失败，请稍后重试。",
  INVITE_UNAVAILABLE:
    "邀请码无效、已过期、已撤销或名额已满，请向实验室负责人索取有效邀请码。",
  USERNAME_TAKEN: "这个用户名已被使用，请换一个；如果是你刚注册的账号，可以直接登录。",
};

export function serviceErrorMessage(
  code: string,
  status: number,
  route?: string,
): string {
  if (code === "UNAUTHENTICATED" && route === "login")
    return "用户名或密码不正确，或账号已停用，请核对后重试。";
  return (
    messages[code] ??
    (status >= 500
      ? "服务暂不可用，请稍后重试。"
      : "操作未完成，请核对填写内容后重试。")
  );
}

export function normalizeAuthBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const normalized = { ...body } as Record<string, unknown>;
  for (const field of ["username", "inviteCode"]) {
    const value = normalized[field];
    if (typeof value === "string") normalized[field] = value.trim();
  }
  return normalized;
}
