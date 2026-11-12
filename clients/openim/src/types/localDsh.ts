export type LocalDshSnapshot = {
  phase: "stopped" | "starting" | "running" | "stopping" | "error";
  directory: string;
  home: string;
  version?: string;
  error?: string;
  pageReady: boolean;
  accountId?: string;
  model?: string;
  bundled?: boolean;
};
export type DshBounds = { x: number; y: number; width: number; height: number };
export type LocalDshBridge = {
  taskAddDeliverables: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget) => Promise<string[]>;
  taskAddLocal: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget) => Promise<boolean>;
  /** Copies files from the registered local library into the task's work folder. */
  taskImportLibrary: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget, rels: string[]) => Promise<boolean>;
  taskImportTeamLibrary: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget, selection: import('./teamLibrary').TeamLibrarySelection) => Promise<{count:number;revision:string}>;
  taskReveal: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget, name?: string) => Promise<void>;
  taskArchive: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget,
    selection: import('../../../../integrations/deepseek-harness/desktop/material-archive').ArchiveSelection,
    rebase?: boolean) => Promise<import('../../../../integrations/deepseek-harness/desktop/material-archive').ArchiveReceipt>;
  status: () => Promise<LocalDshSnapshot>;
  connect: () => Promise<LocalDshSnapshot>;
  disconnect: () => Promise<void>;
  start: () => Promise<LocalDshSnapshot>;
  stop: () => Promise<LocalDshSnapshot>;
  show: (bounds: DshBounds | null) => Promise<void>;
  taskOpen: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
    pick?: boolean,
  ) => Promise<
    | import("../../../../integrations/deepseek-harness/desktop/task-workspace").DshTaskState
    | undefined
  >;
  taskStatus: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
  ) => Promise<
    | import("../../../../integrations/deepseek-harness/desktop/task-workspace").DshTaskState
    | undefined
  >;
  taskAbandonPending: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget)=>Promise<void>;
  taskKnowledge: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget) => Promise<{policy: import('@research-agent-platform/contracts').WorkContext; skills:{name:string;description:string;version:string}[]}>;
  taskPreferences: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget, value:{personalMemory:boolean;skills:string[]})=>Promise<void>;
  taskCheckpoint: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget, value:import('../../../../integrations/deepseek-harness/desktop/work-memory').HandoffInput, expectedVersion:number)=>Promise<unknown>;
  taskNewSession: (target: import('../../../../integrations/deepseek-harness/desktop/task-workspace').TaskTarget)=>Promise<void>;
  taskPrompt: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
    text: string,
    requestId: string,
  ) => Promise<void>;
  taskNote: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
    note: string,
  ) => Promise<void>;
  taskCancel: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
  ) => Promise<void>;
  taskRebase: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
  ) => Promise<void>;
  taskSubmit: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
    summary: string,
    names: string[],
  ) => Promise<unknown>;
  taskImport: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
    source: Pick<
      import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskSource,
      "kind" | "id" | "version"
    >,
  ) => Promise<unknown>;
  taskOutput: (
    target: import("../../../../integrations/deepseek-harness/desktop/task-workspace").TaskTarget,
    name: string,
  ) => Promise<{
    filename: string;
    contentBase64: string;
    mediaType: string;
    preview: string;
  }>;
};
