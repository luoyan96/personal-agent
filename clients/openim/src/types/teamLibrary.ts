import type {
  TeamLibraryEntry,
  TeamLibraryManifest,
  TeamRepositoryBinding,
} from "@research-agent-platform/contracts";
export type TeamLibrarySnapshot = {
  binding: TeamRepositoryBinding;
  revision: string;
  syncedAt: string;
  manifest: TeamLibraryManifest;
  stale?: boolean;
  warning?: string;
};
export type TeamLibrarySelection = {
  revision: string;
  entryId: string;
  includeRules?: boolean;
};
export type TeamLibraryPreview =
  | { kind: "text"; text: string; truncated?: boolean }
  | { kind: "image"; dataUrl: string }
  | { kind: "file"; name: string; size: number };
export type TeamLibraryProposal = {
  branch: string;
  commit: string;
  reviewUrl: string;
  entry: TeamLibraryEntry | null;
};
export type TeamLibraryBridge = {
  discover: (
    url: string,
  ) => Promise<Pick<TeamRepositoryBinding, "url" | "branch" | "workspaceId">>;
  sync: () => Promise<TeamLibrarySnapshot>;
  cached: () => Promise<TeamLibrarySnapshot | null>;
  preview: (selected: TeamLibrarySelection) => Promise<TeamLibraryPreview>;
  open: (selected: TeamLibrarySelection) => Promise<void>;
  propose: (
    revision: string,
    entry: TeamLibraryEntry,
    text?: string,
  ) => Promise<TeamLibraryProposal>;
  changes: () => Promise<{ revision: string; title: string; date: string }[]>;
  proposeProject: (
    revision: string,
    project: { id: string; name: string; description: string },
  ) => Promise<TeamLibraryProposal>;
};
