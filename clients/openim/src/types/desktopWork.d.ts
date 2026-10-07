export interface DesktopReportScope {
  actorId: string;
  conversationId: string;
}

export interface DesktopReportArtifact {
  id: string;
  title: string;
  createdAt: string;
}

export type DesktopReportErrorCode =
  | "DESKTOP_REPORT_FORBIDDEN"
  | "DESKTOP_REPORT_INVALID"
  | "DESKTOP_REPORT_TOO_LARGE"
  | "DESKTOP_REPORT_NOT_FOUND"
  | "DESKTOP_REPORT_CORRUPT"
  | "DESKTOP_REPORT_IO_FAILED"
  | "DESKTOP_REPORT_OPEN_FAILED";
