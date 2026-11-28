export type WorkbenchMaterialKind = "template" | "reference";

export type WorkbenchMaterial = {
  id: string;
  name: string;
  source: "personal" | "team";
  path?: string;
  description?: string;
  size?: number;
  availability: "file" | "metadata" | "text";
};

export type WorkbenchMaterialBridge = {
  list: (selection: { kind: WorkbenchMaterialKind; extensions?: string[] }) => Promise<{
    items: WorkbenchMaterial[];
    warnings: string[];
  }>;
  read: (selection: { kind: WorkbenchMaterialKind; id: string }) => Promise<{
    name: string;
    bytes: ArrayBuffer;
  }>;
  readMany: (selection: { selections: { kind: WorkbenchMaterialKind; id: string }[] }) => Promise<{
    kind: WorkbenchMaterialKind;
    id: string;
    name: string;
    bytes: ArrayBuffer;
  }[]>;
};
