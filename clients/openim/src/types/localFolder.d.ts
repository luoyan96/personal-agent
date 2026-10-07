export type LocalFolderFileKind = "text" | "pdf" | "docx";
export type LocalFolderFile = {
  id: string;
  relativePath: string;
  byteLength: number;
  kind: LocalFolderFileKind;
};
export type LocalFolderManifest = {
  grantId: string;
  folderName: string;
  files: LocalFolderFile[];
  scan: { visitedEntries: number; excludedEntries: number; truncated: boolean };
  limits: { maxSelectedFiles: number; maxMergedBytes: number };
};
export type LocalFolderSelection = {
  grantId: string;
  files: (LocalFolderFile & { text: string; pageCount?: number })[];
  markdown: string;
  utf8Bytes: number;
};
export type LocalFolderReadRequest = { grantId: string; fileIds: string[]; mode?: "workspace" };
export type LocalFolderErrorCode =
  | "LOCAL_FOLDER_FORBIDDEN"
  | "LOCAL_FOLDER_REVOKED"
  | "LOCAL_FOLDER_CHANGED"
  | "LOCAL_FOLDER_INVALID_SELECTION"
  | "LOCAL_FOLDER_TOO_LARGE"
  | "LOCAL_FOLDER_BINARY"
  | "LOCAL_FOLDER_PARSE_FAILED"
  | "LOCAL_FOLDER_NO_TEXT"
  | "LOCAL_FOLDER_ENCRYPTED"
  | "LOCAL_FOLDER_TIMEOUT";
