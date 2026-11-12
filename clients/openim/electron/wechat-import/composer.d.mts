import type { WeChatPreview, WeChatImportBridge } from "../../src/types/wechatImport";
export function prepareWeChatDraft(options: {
  client: Pick<WeChatImportBridge, "read">; scope: string; preview: WeChatPreview;
  attachmentIds?: string[]; includeOriginal?: boolean;
  isCurrentScope: (scope: string) => boolean;
}): Promise<{ source: "wechat-share"; sourceHash: string; text: string; files: File[] }>;
