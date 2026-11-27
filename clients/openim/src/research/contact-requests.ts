import type { ContactRequest, ResponseFor } from "@research-agent-platform/contracts";
import { useQuery, useQueryClient } from "react-query";

import { researchApi } from "./api";
import { useResearchStore } from "./store";

type RequestPage = ResponseFor<"contactRequests">;
type Session = { generation: number; actorId?: string };

const scopeKey = ({ generation, actorId }: Session) =>
  ["contact-requests", generation, actorId] as const;
const pendingKey = (session: Session) =>
  [...scopeKey(session), "pending-incoming"] as const;
export const requestListKey = (session: Session, list: "sent" | "history") =>
  [...scopeKey(session), list] as const;

function useRequestSession() {
  const generation = useResearchStore((state) => state.generation);
  const actorId = useResearchStore((state) => state.actor?.member.id);
  return { generation, actorId };
}

export async function readPendingRequests(
  actorId: string,
  readPage: (cursor?: string) => Promise<RequestPage>,
) {
  const pending = new Map<string, ContactRequest>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await readPage(cursor);
    for (const request of page.data) {
      if (request.status === "pending" && request.deciderMemberId === actorId) {
        pending.set(request.id, request);
      }
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error("好友申请分页暂不可用，请重试。");
      cursors.add(cursor);
    }
  } while (cursor);
  return Array.from(pending.values());
}

export function usePendingContactRequests(watch = false) {
  const session = useRequestSession();
  return useQuery(
    pendingKey(session),
    ({ signal }) =>
      readPendingRequests(session.actorId!, (cursor) =>
        researchApi("contactRequests", {
          query: { direction: "incoming", status: "pending", limit: 100, cursor },
          signal,
        }),
      ),
    {
      enabled: !!session.actorId,
      staleTime: 10000,
      retry: false,
      refetchInterval: watch ? 10000 : false,
      refetchOnWindowFocus: watch ? "always" : false,
    },
  );
}

export function useContactRequestCache() {
  const session = useRequestSession();
  const client = useQueryClient();
  const isCurrent = () => {
    const state = useResearchStore.getState();
    return (
      !!session.actorId &&
      session.actorId === state.actor?.member.id &&
      session.generation === state.generation
    );
  };
  const refresh = () => {
    if (isCurrent()) void client.invalidateQueries(scopeKey(session));
  };
  const acknowledge = async (request: ContactRequest) => {
    if (!isCurrent()) return;
    // A read started before the write may still contain the old pending row.
    await client.cancelQueries(scopeKey(session));
    if (!isCurrent()) return;
    const key = pendingKey(session);
    const current = client.getQueryData<ContactRequest[]>(key);
    if (current && request.status !== "pending") {
      client.setQueryData(
        key,
        current.filter(
          (item) => item.id !== request.id || item.version > request.version,
        ),
      );
    }
    refresh();
  };
  return { acknowledge, refresh, isCurrent };
}

export function pendingFriendRequestLabel(count: number) {
  return `${count} 条待处理的好友申请`;
}

export const pendingFriendRequestColor = "#b52732";
