export type ZoteroCollection = { key: string; name: string };
export type ZoteroItem = {
  key: string;
  version: number;
  title: string;
  authors: string[];
  date: string;
  publication: string;
  doi: string;
  url: string;
  abstract: string;
};
export type ZoteroPage<T> = { items: T[]; start: number; hasMore: boolean };
export type ZoteroReadRequest =
  | { kind: "collections"; start: number }
  | { kind: "items"; start: number; collectionKey: string; query: string };
export type ZoteroGrant = { id: string; expiresAt: number; serverId: string | null };
