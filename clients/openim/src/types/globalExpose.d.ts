import { Platform } from "@openim/wasm-client-sdk";
import type { DesktopUpdateSnapshot, DesktopUpdateAction } from "./desktopUpdates";
import type { DesktopReportArtifact, DesktopReportScope } from "./desktopWork";
import type {
  LocalFolderManifest,
  LocalFolderReadRequest,
  LocalFolderSelection,
} from "./localFolder";

export type DataPath = "public" | "emojiData" | "sdkResources" | "logsPath";

export interface IElectronAPI {
  saveImageBytesToDisk: (filename: string, bytes: Uint8Array) => Promise<string>;
  readChatClipboardImages: () => Promise<import("./imageClipboard").ClipboardImages>;
  recognizeChatImage: (id: string, bytes: Uint8Array) => Promise<import("./imageClipboard").ImageOcrResult>;
  cancelChatImageOcr: (id: string) => Promise<void>;
  saveChatImageText: (text: string, original: boolean) => Promise<boolean>;
  inspectSkillGithub: (address:string) => Promise<{id:string;label:string;revision:string}[]>;
  importPrivateSkill: (kind:"folder"|"zip"|"github", selection?:string) => Promise<import("@research-agent-platform/contracts").RequestFor<"installSkill">["body"]|null>;
  getDesktopUpdateState: () => Promise<DesktopUpdateSnapshot>;
  onDesktopUpdateState: (callback: (state: DesktopUpdateSnapshot) => void) => () => void;
  desktopUpdateAction: (action: DesktopUpdateAction, version?: string) => Promise<DesktopUpdateSnapshot>;
  createDesktopReport: (scope: DesktopReportScope, title: string, markdown: string, sources: string[]) => Promise<DesktopReportArtifact>;
  listDesktopReports: (scope: DesktopReportScope) => Promise<DesktopReportArtifact[]>;
  openDesktopReport: (scope: DesktopReportScope, id: string) => Promise<void>;
  revealDesktopReport: (scope: DesktopReportScope, id: string) => Promise<void>;
  getResearchServiceStatus: () => Promise<{ connected: boolean; address: string; error: string }>;
  configureResearchService: (address: string) => Promise<void>;
  pickLocalFolder: () => Promise<LocalFolderManifest | null>;
  readLocalFolderSelection: (
    selection: LocalFolderReadRequest,
  ) => Promise<LocalFolderSelection>;
  releaseLocalFolder: (grantId: string) => Promise<void>;
  getDataPath: (key: DataPath) => string;
  getVersion: () => string;
  getPlatform: () => Platform;
  getSystemVersion: () => string;
  subscribe: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  subscribeOnce: (channel: string, callback: (...args: unknown[]) => void) => void;
  unsubscribeAll: (channel: string) => void;
  ipcInvoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  ipcSendSync: <T = unknown>(channel: string, ...args: unknown[]) => T;
  saveFileToDisk: (params: { file: File; sync?: boolean }) => Promise<string>;
  getFileByPath: (filePath: string) => Promise<File | null>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
    userClick: (userID?: string, groupID?: string) => void;
    editRevoke: (clientMsgID: string) => void;
    screenshotPreview: (results: string) => void;
  }
}

declare module "i18next" {
  interface TFunction {
    (key: string, options?: object): string;
  }
}
