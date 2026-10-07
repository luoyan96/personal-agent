import { Alert, Button } from "antd";
import type { Contact } from "@research-agent-platform/contracts";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import OIMAvatar from "@/components/OIMAvatar";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchContactChat } from "./useResearchContactChat";

export const contactRelationshipLabel: Record<
  Contact["relationship"]["status"],
  string
> = {
  own: "本人或我的 Agent",
  none: "尚未添加",
  pending_outbound: "等待同意",
  pending_inbound: "待你同意",
  accepted: "已添加",
  declined: "申请未通过",
  revoked: "关系已移除",
};

/** A public name card. Private memory and connection credentials stay in owner management. */
export function WorkspaceContactCard({
  contactId,
  onManage,
  onChanged,
  children,
}: {
  contactId: string;
  onManage?: (id: string) => void;
  onChanged?: () => Promise<void>;
  children?: ReactNode;
}) {
  const read = useResearchRead(
    () => researchApi("chatContact", { params: { id: contactId } }),
    `workspace-contact:${contactId}`,
    !!contactId,
  );
  const operation = usePersonalOperation(true, `workspace-card:${contactId}`);
  const actor = useResearchStore((s) => s.actor),
    contacts = useResearchStore((s) => s.contacts);
  const openChat = useResearchContactChat();
  const [action, setAction] = useState<{
    scope: string;
    busy: boolean;
    error: string;
    notice: string;
  }>();
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    inFlight.current = false;
  }, [operation.scope]);
  const c = read.data?.data;
  const requests = useResearchRead(
    () =>
      researchApi("contactRequests", {
        query: { direction: "incoming", status: "pending", limit: 100 },
      }),
    `workspace-incoming:${contactId}`,
    c?.relationship.status === "pending_inbound",
  );
  const request = requests.data?.data.find((r) => r.id === c?.relationship.requestId);
  const currentAction = action?.scope === operation.scope ? action : undefined;
  const command = async (
    run: (isCurrent: () => boolean) => Promise<unknown>,
    notice = "",
  ) => {
    if (inFlight.current || !c) return;
    const { isCurrent } = operation.capture();
    inFlight.current = true;
    setAction({ scope: operation.scope, busy: true, error: "", notice: "" });
    try {
      await run(isCurrent);
      if (!isCurrent()) return;
      await read.refresh();
      if (!isCurrent()) return;
      await onChanged?.();
      if (isCurrent())
        setAction({ scope: operation.scope, busy: false, error: "", notice });
    } catch (error) {
      if (isCurrent())
        setAction({
          scope: operation.scope,
          busy: false,
          error: error instanceof Error ? error.message : "操作未完成，请稍后重试。",
          notice: "",
        });
    } finally {
      if (isCurrent()) inFlight.current = false;
    }
  };
  if (!c)
    return (
      <div className="workspace-namecard">
        {read.error ? (
          <Alert
            type="error"
            message={read.error}
            action={<Button onClick={read.refresh}>重试</Button>}
          />
        ) : (
          <p role="status">正在读取联系人资料…</p>
        )}
      </div>
    );
  const human = c.identity.kind === "human";
  const ownerId =
    !human && c.identity.kind !== "human" ? c.identity.ownerMemberId : undefined;
  const ownerName =
    actor && ownerId === actor.member.id
      ? actor.member.displayName
      : contacts.find(
          (entry) =>
            entry.contact.identity.kind === "human" &&
            entry.contact.identity.memberId === ownerId,
        )?.contact.displayName;
  return (
    <section className="workspace-namecard" aria-label="联系人名片">
      <header className="workspace-namecard-heading">
        <OIMAvatar text={c.displayName} size={64} />
        <div>
          <h2>{c.displayName}</h2>
          <span className={`workspace-kind ${human ? "human" : "agent"}`}>
            {human ? "个人" : "Agent"}
          </span>
          {c.username && <p className="workspace-muted">@{c.username}</p>}
        </div>
      </header>
      <p className="workspace-card-intro">
        {c.profile.introduction || "还没有填写介绍"}
      </p>
      <dl className="workspace-profile-fields">
        <div>
          <dt>能力</dt>
          <dd>{c.profile.capabilityDescription || "还没有填写能力介绍"}</dd>
        </div>
        <div>
          <dt>性格与偏好</dt>
          <dd>{c.profile.personality || "还没有填写"}</dd>
        </div>
        {!human && (
          <div>
            <dt>所属</dt>
            <dd>
              {ownerName || "由所属账号管理"}
              {ownerId === actor?.member.id ? " · 我的 Agent" : ""}
            </dd>
          </div>
        )}
        <div>
          <dt>关系</dt>
          <dd>{contactRelationshipLabel[c.relationship.status]}</dd>
        </div>
        {!human && (
          <div>
            <dt>运行方式</dt>
            <dd>
              {c.agentRuntime ? (
                <>
                  <strong>外部文字服务</strong>
                  <span className="workspace-muted break-all">
                    {c.agentRuntime.serviceOrigin}
                  </span>
                  <span>
                    {c.agentRuntime.verification === "passed"
                      ? "最近一次连接测试通过"
                      : c.agentRuntime.verification === "failed"
                      ? "最近一次测试失败"
                      : "尚未验证连接"}
                  </span>
                  <span className="workspace-muted">
                    每条文字单独授权；本站记忆、文件不转发。
                    {c.agentRuntime.callerAllowed
                      ? "你已获准调用。"
                      : "当前账号未获准调用。"}
                  </span>
                </>
              ) : (
                <>
                  <strong>站内 Agent</strong>
                  <span className="workspace-muted">
                    使用聊天发起人的模型设置与获准资料。
                  </span>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>
      {(currentAction?.error || currentAction?.notice) && (
        <Alert
          className="workspace-action-feedback"
          type={currentAction.error ? "error" : "info"}
          message={currentAction.error || currentAction.notice}
        />
      )}
      <div className="workspace-card-actions">
        {c.allowedActions.includes("chat") && (
          <Button
            type="primary"
            loading={currentAction?.busy}
            onClick={() => void command((isCurrent) => openChat(c.id, isCurrent))}
          >
            发消息
          </Button>
        )}
        {c.allowedActions.includes("request") && (
          <Button
            type="primary"
            loading={currentAction?.busy}
            onClick={() =>
              void command(
                () => researchApi("requestContact", { params: { id: c.id }, body: {} }),
                "申请已发送，等待对方同意。",
              )
            }
          >
            添加联系人
          </Button>
        )}
        {request?.allowedDecisions.includes("accept") && (
          <Button
            type="primary"
            loading={currentAction?.busy}
            onClick={() =>
              void command(
                () =>
                  researchApi("decideContactRequest", {
                    params: { id: request.id },
                    body: { expectedVersion: request.version, decision: "accept" },
                  }),
                "已同意添加，可以开始聊天。",
              )
            }
          >
            同意添加
          </Button>
        )}
        {onManage && (
          <Button onClick={() => onManage(c.id)}>
            {c.allowedActions.includes("edit_profile") ? "资料与管理" : "更多资料"}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}
