export type UpdatePhase =
  | "idle" | "checking" | "current" | "available" | "downloading"
  | "downloaded" | "installing" | "error";

export type UpdateState = {
  phase: UpdatePhase;
  currentVersion: string;
  version?: string;
  percent?: number;
  notes?: string;
  error?: "check" | "download" | "install";
};

export type DesktopUpdateSnapshot = UpdateState & { supported: boolean };
export type DesktopUpdateAction = "check" | "download" | "install";
