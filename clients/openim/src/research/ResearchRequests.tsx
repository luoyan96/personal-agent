import { ArrowLeftOutlined, UserOutlined } from "@ant-design/icons";
import type { ContactRequest, ResponseFor } from "@research-agent-platform/contracts";
import { Alert, App } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "react-query";
import { Link } from "react-router-dom";

import { researchApi } from "./api";
import {
  requestListKey,
  useContactRequestCache,
  usePendingContactRequests,
} from "./contact-requests";
import ResearchAvatar from "./ResearchAvatar";
import { useResearchStore } from "./store";
import "./friend-requests.scss";

const views = [
  { id: "incoming", label: "待处理", empty: "没有待处理的好友申请" },
  { id: "sent", label: "已发出", empty: "还没有发出好友申请" },
  { id: "history", label: "已处理", empty: "暂无已处理的好友申请" },
] as const;
type View = (typeof views)[number]["id"];
type Action = "accept" | "decline" | "revoke";
const incomingPageSize = 50;

const statusLabels = {
  pending: "等待对方处理",
  accepted: "已同意",
  declined: "已拒绝",
  revoked: "已撤回或撤销",
};
const requestDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

async function readArchive(
  view: "sent" | "history",
  signal?: AbortSignal,
  cursor?: string,
): Promise<ResponseFor<"contactRequests">> {
  const cursors = new Set<string>();
  for (;;) {
    const page = await researchApi("contactRequests", {
      query: {
        direction: view === "sent" ? "outgoing" : "all",
        status: "all",
        limit: 30,
        cursor,
      },
      signal,
    });
    if (view === "sent") return page;
    const processed = page.data.filter((request) => request.status !== "pending");
    if (processed.length || !page.nextCursor) return { ...page, data: processed };
    cursor = page.nextCursor;
    if (cursors.has(cursor)) throw new Error("好友申请分页暂不可用，请重试。");
    cursors.add(cursor);
  }
}

export function ResearchRequests() {
  const actorId = useResearchStore((state) => state.actor?.member.id);
  const generation = useResearchStore((state) => state.generation);
  return (
    <RequestPage
      key={`${generation}:${actorId}`}
      actorId={actorId}
      generation={generation}
    />
  );
}

function RequestPage({
  actorId,
  generation,
}: {
  actorId?: string;
  generation: number;
}) {
  const [view, setView] = useState<View>("incoming");
  const [visibleIncoming, setVisibleIncoming] = useState(incomingPageSize);
  const pending = usePendingContactRequests();
  const cache = useContactRequestCache();
  const { modal } = App.useApp();
  const archiveView = view === "sent" ? "sent" : "history";
  const archive = useInfiniteQuery(
    requestListKey({ actorId, generation }, archiveView),
    ({ pageParam, signal }) => readArchive(archiveView, signal, pageParam),
    {
      enabled: !!actorId && view !== "incoming",
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      retry: false,
      staleTime: 10000,
      refetchInterval: 10000,
      refetchOnWindowFocus: "always",
    },
  );
  const [processing, setProcessing] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error";
  }>();
  const [syncWarning, setSyncWarning] = useState(false);
  const mounted = useRef(false);
  const activeFilter = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<ReturnType<typeof modal.confirm>>();
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      confirmation.current?.destroy();
    };
  }, []);

  const command = async (request: ContactRequest, action: Action) => {
    const current = () => mounted.current && cache.isCurrent();
    if (!current() || inFlight.current.has(request.id)) return;
    const focused = document.activeElement;
    inFlight.current.add(request.id);
    setProcessing(new Set(inFlight.current));
    setFeedback(undefined);
    setSyncWarning(false);
    try {
      const params = { id: request.id };
      const expectedVersion = request.version;
      const { data } =
        action === "revoke"
          ? await researchApi("revokeContactRequest", {
              params,
              body: { expectedVersion },
            })
          : await researchApi("decideContactRequest", {
              params,
              body: { expectedVersion, decision: action },
            });
      await cache.acknowledge(data);
      if (!cache.isCurrent()) return;
      void (async () => {
        try {
          await researchApi("imSync", { body: {} });
          if (cache.isCurrent()) await useResearchStore.getState().refresh();
        } catch {
          if (current()) setSyncWarning(true);
        }
      })();
      if (!current()) return;
      const message = {
        accept: "已同意好友申请",
        decline: "已拒绝好友申请",
        revoke: request.status === "pending" ? "已撤回好友申请" : "已撤销联系人授权",
      }[action];
      setFeedback({ type: "success", message });
      if (
        view === "incoming" &&
        (document.activeElement === focused || document.activeElement === document.body)
      ) {
        activeFilter.current?.focus();
      }
    } catch (error) {
      cache.refresh();
      if (current()) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "操作未完成，请重试。",
        });
      }
    } finally {
      inFlight.current.delete(request.id);
      if (current()) setProcessing(new Set(inFlight.current));
    }
  };

  const revoke = (request: ContactRequest) => {
    if (inFlight.current.has(request.id)) return;
    const pending = request.status === "pending";
    confirmation.current = modal.confirm({
      title: pending ? "撤回好友申请？" : "撤销联系人授权？",
      content: pending ? undefined : "群成员身份和已承接的任务会保留。",
      okText: pending ? "撤回申请" : "撤销授权",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => command(request, "revoke"),
    });
  };

  const isInbox = view === "incoming";
  const read = isInbox ? pending : archive;
  const rows = isInbox
    ? pending.data?.slice(0, visibleIncoming)
    : archive.data?.pages.flatMap((page) => page.data);
  const hasMore = isInbox ? (pending.data?.length ?? 0) > visibleIncoming : archive.hasNextPage;
  const empty = views.find((tab) => tab.id === view)?.empty;

  return (
    <main className="friend-requests" aria-labelledby="friend-requests-title">
      <div className="friend-requests-content">
        <header className="friend-requests-heading">
          <Link to="/contact" className="friend-requests-back">
            <ArrowLeftOutlined aria-hidden="true" /> 通讯录
          </Link>
          <h1 id="friend-requests-title">好友申请</h1>
        </header>
        <div className="friend-requests-filters" role="group" aria-label="筛选好友申请">
          {views.map((tab) => (
            <button
              type="button"
              key={tab.id}
              ref={view === tab.id ? activeFilter : undefined}
              aria-pressed={view === tab.id}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {feedback && <Alert type={feedback.type} message={feedback.message} showIcon />}
        {syncWarning && (
          <Alert type="warning" message="通讯录暂未同步，好友申请的处理结果已保存。" />
        )}
        {read.isError && (
          <Alert
            type="error"
            message={
              read.error instanceof Error ? read.error.message : "好友申请暂未加载。"
            }
            action={
              <button type="button" onClick={() => void read.refetch()}>
                重试
              </button>
            }
          />
        )}
        {!rows && !read.isError && (
          <p className="friend-requests-empty" role="status">
            正在读取好友申请…
          </p>
        )}
        {rows?.length === 0 && !read.isError && (isInbox || !archive.hasNextPage) && (
          <p className="friend-requests-empty" role="status">
            {empty}
          </p>
        )}
        {!!rows?.length && actorId && (
          <ul className="friend-requests-list">
            {rows.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                actorId={actorId}
                generation={generation}
                showDirection={view === "history"}
                busy={processing.has(request.id)}
                onDecision={(action) => void command(request, action)}
                onRevoke={() => revoke(request)}
              />
            ))}
          </ul>
        )}
        {hasMore && (
          <button
            className="friend-requests-more"
            type="button"
            disabled={!isInbox && archive.isFetching}
            onClick={() => {
              if (isInbox) setVisibleIncoming((count) => count + incomingPageSize);
              else void archive.fetchNextPage();
            }}
          >
            {!isInbox && archive.isFetchingNextPage ? "正在加载…" : "查看更多"}
          </button>
        )}
      </div>
    </main>
  );
}

function useRequestContact(
  actorId: string,
  generation: number,
  contactId: string,
  enabled = true,
) {
  return useQuery(
    ["request-contact", generation, actorId, contactId],
    ({ signal }) => researchApi("chatContact", { params: { id: contactId }, signal }),
    { enabled, retry: false, staleTime: 300000 },
  ).data?.data;
}

function RequestRow({
  request,
  actorId,
  generation,
  showDirection,
  busy,
  onDecision,
  onRevoke,
}: {
  request: ContactRequest;
  actorId: string;
  generation: number;
  showDirection: boolean;
  busy: boolean;
  onDecision: (action: "accept" | "decline") => void;
  onRevoke: () => void;
}) {
  const sent = request.requesterMemberId === actorId;
  const peer = useRequestContact(
    actorId,
    generation,
    sent ? request.targetContactId : request.requesterContactId,
  );
  const target = useRequestContact(actorId, generation, request.targetContactId, !sent);
  const name = peer?.displayName ?? "联系人";
  const context =
    target && target.identity.kind !== "human"
      ? `申请联系你的助理「${target.displayName}」`
      : undefined;
  const actionable =
    !sent && request.status === "pending" && request.deciderMemberId === actorId;
  const revocable =
    (sent && request.status === "pending") || request.status === "accepted";
  return (
    <li className="friend-request-row" data-actionable={actionable} aria-busy={busy}>
      <ResearchAvatar
        className="friend-request-avatar"
        contact={peer}
        text={peer?.displayName}
        icon={!peer ? <UserOutlined /> : undefined}
        size={44}
        aria-hidden="true"
      />
      <div className="friend-request-copy">
        <strong>{name}</strong>
        {context && <p>{context}</p>}
        <p className="friend-request-meta">
          <time dateTime={request.createdAt}>
            {requestDate.format(new Date(request.createdAt))}
          </time>
          {showDirection && (sent ? " · 发出" : " · 收到")}
        </p>
      </div>
      <div className="friend-request-actions">
        {actionable ? (
          <>
            {request.allowedDecisions.includes("decline") && (
              <button
                type="button"
                aria-label={`拒绝 ${name} 的申请`}
                aria-disabled={busy}
                onClick={() => onDecision("decline")}
              >
                拒绝
              </button>
            )}
            {request.allowedDecisions.includes("accept") && (
              <button
                className="friend-request-accept"
                type="button"
                aria-label={`同意 ${name} 的申请`}
                aria-disabled={busy}
                onClick={() => onDecision("accept")}
              >
                同意
              </button>
            )}
          </>
        ) : (
          <span className="friend-request-status" data-status={request.status}>
            {statusLabels[request.status]}
          </span>
        )}
        {revocable && (
          <button type="button" aria-disabled={busy} onClick={onRevoke}>
            {request.status === "pending" ? "撤回申请" : "撤销授权"}
          </button>
        )}
      </div>
    </li>
  );
}
