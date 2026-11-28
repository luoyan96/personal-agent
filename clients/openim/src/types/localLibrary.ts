export type LocalLibraryFile = {
  /** Relative to the registered folder; this is what templates store. */
  rel: string;
  name: string;
  size: number;
  updatedAt: string;
};

export type LocalLibraryManifest = {
  root: string;
  name: string;
  files: LocalLibraryFile[];
  truncated: boolean;
};

export type LocalLibraryStatus =
  | { registered: false }
  | { registered: true; available: boolean; root: string; name: string };

export type LocalLibraryBridge = {
  status: () => Promise<LocalLibraryStatus>;
  /** Only a path is remembered; nothing is uploaded or copied. */
  pick: () => Promise<LocalLibraryManifest | null>;
  scan: () => Promise<LocalLibraryManifest>;
  /** Reads the file to compare "same name" with "same content". */
  hash: (rel: string) => Promise<{ sha256: string; size: number }>;
  personalStatus: () => Promise<LocalLibraryStatus>;
  personalScan: () => Promise<LocalLibraryManifest>;
  openPersonalFolder: () => Promise<void>;
  revealPersonalFile: (rel: string) => Promise<void>;
  /** Copies files selected in a native picker into the current account's folder. */
  addPersonalFiles: () => Promise<LocalLibraryManifest | null>;
};
