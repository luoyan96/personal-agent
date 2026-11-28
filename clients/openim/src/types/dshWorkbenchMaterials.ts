export type WorkbenchMaterialKind = "template" | "reference";

export type WorkbenchMaterial = {
  id: string;
  name: string;
  title?: string;
  source: "personal" | "team";
  path?: string;
  description?: string;
  size?: number;
  availability: "file" | "metadata" | "text";
  provenance?: { kind: "team-git"; repository: string; path: string; revision: string };
  representation?: "original" | "metadata";
};

export type WorkbenchUseTarget = "group-meeting" | "existing-document" | "existing-paper";
export type WorkbenchUseSource =
  | { source: "personal"; files: { rel: string; size: number; updatedAt: string }[] }
  | { source: "team-git"; revision: string; paths: string[] };
export type WorkbenchUseIn = { id: string; target: WorkbenchUseTarget; items: WorkbenchMaterial[] };
type WorkbenchMaterialRead = { kind: WorkbenchMaterialKind; id: string; name: string; bytes: ArrayBuffer };

export type WorkbenchMaterialBridge = {
  list: (selection: { kind: WorkbenchMaterialKind; extensions?: string[] }) => Promise<{
    items: WorkbenchMaterial[];
    warnings: string[];
  }>;
  read: (selection: { kind: WorkbenchMaterialKind; id: string }) => Promise<{
    name: string;
    bytes: ArrayBuffer;
  }>;
  readMany: (selection: { selections: { kind: WorkbenchMaterialKind; id: string }[] }) => Promise<WorkbenchMaterialRead[]>;
  pendingUseIn: () => Promise<WorkbenchUseIn | null>;
  readUseIn: (selection: { id: string; selectionIds?: string[]; selections?: { kind: WorkbenchMaterialKind; id: string }[] }) => Promise<WorkbenchMaterialRead[]>;
  clearUseIn: (selection: { id: string }) => Promise<void>;
};
