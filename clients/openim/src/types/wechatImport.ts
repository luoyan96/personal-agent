export type WeChatPreview = {
  token: string;
  source: "wechat-share";
  sha256: string;
  archiveName: string;
  originalSize: number;
  transcriptName: string | null;
  rawText: string | null;
  messages:
    | { index: number; sender: string; exportedTime: string; text: string }[]
    | null;
  attachments: { id: string; name: string; size: number }[];
  warnings: string[];
};
export type SharedWeChatBatch = { id: string; name: string; size: number };
export type WeChatImportBridge = {
  context: (
    value: { conversationID: string; memberId: string; visit: string } | null,
  ) => Promise<string | null>;
  choose: (scope: string, batchId?: string) => Promise<WeChatPreview | null>;
  read: (scope: string, token: string, id: string) => Promise<Uint8Array>;
  release: (scope: string, token: string) => Promise<void>;
  pending: (scope: string) => Promise<SharedWeChatBatch[]>;
  registration: (scope: string) => Promise<boolean>;
  acknowledge: (scope: string, batchId: string) => Promise<void>;
  onShared: (callback: () => void) => () => void;
};
