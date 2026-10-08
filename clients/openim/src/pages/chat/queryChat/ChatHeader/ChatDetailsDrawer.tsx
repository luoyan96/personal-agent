import { useEffect, useRef, useState } from "react";
import { Button, Drawer, Spin, Switch } from "antd";
import { PlusOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import {
  GroupMemberFilter,
  MessageReceiveOption,
  type GroupMemberItem,
} from "@openim/wasm-client-sdk";
import { IMSDK } from "@/layout/MainContentWrap";
import OIMAvatar from "@/components/OIMAvatar";
import { useConversationStore } from "@/store";
import { useResearchStore } from "@/research/store";
import { researchApi } from "@/research/api";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "@/research/useAgentChatOperation";
import { withRequestDeadline } from "@/research/request-deadline";
import { emit } from "@/utils/events";

type Props = {
  open: boolean;
  onClose: () => void;
  onSearch: () => void;
  onManage: () => void;
  onAboutMe: () => void;
};
export default function ChatDetailsDrawer({
  open,
  onClose,
  onSearch,
  onManage,
  onAboutMe,
}: Props) {
  const conversation = useConversationStore((s) => s.currentConversation);
  const generation = useResearchStore((s) => s.generation);
  const group = useConversationStore((s) => s.currentGroupInfo);
  const inGroup = useConversationStore((s) =>
    Boolean(
      conversation?.groupID &&
        s.currentMemberInGroup?.groupID === conversation.groupID &&
        s.currentMemberInGroup?.userID,
    ),
  );
  const contacts = useResearchStore((s) => s.contacts);
  const mapping = useResearchStore((s) =>
    s.mappings.find((m) => m.imConversationID === conversation?.conversationID),
  );
  const isCoordinator = useResearchStore(
    (s) => s.session?.coordinator?.imConversationID === conversation?.conversationID,
  );
  const capture = useAgentChatOperation();
  const active = useRef<AgentChatOperation>();
  const [members, setMembers] = useState<GroupMemberItem[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [memberError, setMemberError] = useState("");
  const epoch = useRef(0);
  const busyRef = useRef(false);
  const visible = useRef(open);
  visible.current = open;
  const isScopeCurrent = () =>
    visible.current &&
    generation === useResearchStore.getState().generation &&
    conversation?.conversationID ===
      useConversationStore.getState().currentConversation?.conversationID;
  const leave = (next: () => void) => {
    visible.current = false;
    epoch.current++;
    active.current?.dispose();
    next();
  };
  useEffect(() => {
    epoch.current++;
    active.current?.dispose();
    busyRef.current = false;
    setMembers([]);
    setMore(false);
    setError("");
    setMemberError("");
    setBusy(false);
    if (open && conversation?.groupID) void loadMembers(0);
    return () => {
      epoch.current++;
      active.current?.dispose();
    };
  }, [open, conversation?.conversationID, generation]);
  const loadMembers = async (offset: number) => {
    if (!isScopeCurrent() || !conversation?.groupID || busyRef.current) return;
    busyRef.current = true;
    const operation = capture();
    active.current?.dispose();
    active.current = operation;
    const requestEpoch = ++epoch.current;
    const current = () =>
      isScopeCurrent() && operation.isCurrent() && requestEpoch === epoch.current;
    setBusy(true);
    setMemberError("");
    try {
      const { data } = await withRequestDeadline(
        () =>
          IMSDK.getGroupMemberList({
            groupID: conversation.groupID,
            filter: GroupMemberFilter.All,
            offset,
            count: 50,
          }),
        30000,
        operation.signal,
      );
      if (!current()) return;
      setMembers((previous) =>
        offset
          ? Array.from(
              new Map(
                [...previous, ...data].map((member) => [member.userID, member]),
              ).values(),
            )
          : data,
      );
      setMore(data.length === 50);
    } catch {
      if (current()) setMemberError("成员暂无法读取，请重试。");
    } finally {
      if (current()) {
        setBusy(false);
        busyRef.current = false;
      }
      operation.dispose();
    }
  };
  const change = async (kind: "pin" | "mute", value: boolean) => {
    if (!isScopeCurrent() || !conversation || busyRef.current) return;
    busyRef.current = true;
    const operation = capture();
    active.current?.dispose();
    active.current = operation;
    const requestEpoch = ++epoch.current;
    const current = () =>
      isScopeCurrent() && operation.isCurrent() && requestEpoch === epoch.current;
    setBusy(true);
    setError("");
    try {
      if (!current()) return;
      if (kind === "pin" && mapping) {
        const canonical = await researchApi("chatConversation", {
          params: { id: mapping.researchConversationId },
          signal: operation.signal,
        });
        if (!current()) return;
        await researchApi("updateChatPreferences", {
          params: { id: mapping.researchConversationId },
          body: { expectedVersion: canonical.data.viewerState.version, pinned: value },
          signal: operation.signal,
        });
      }
      if (!current()) return;
      await withRequestDeadline(
        () =>
          IMSDK.setConversation({
            conversationID: conversation.conversationID,
            ...(kind === "pin"
              ? { isPinned: value }
              : {
                  recvMsgOpt: value
                    ? MessageReceiveOption.ReceiveWithoutNotification
                    : MessageReceiveOption.Receive,
                }),
          }),
        30000,
        operation.signal,
      );
      if (!current()) return;
      const { data } = await withRequestDeadline(
        () =>
          IMSDK.getOneConversation({
            sourceID: conversation.groupID || conversation.userID,
            sessionType: conversation.conversationType,
          }),
        30000,
        operation.signal,
      );
      if (current())
        useConversationStore.getState().updateConversationList([data], "filter");
    } catch (cause) {
      if (current())
        setError(
          `${kind === "pin" ? "置顶" : "免打扰"}设置未确认，请重试核对。${
            cause instanceof Error ? cause.message : ""
          }`,
        );
    } finally {
      if (current()) {
        setBusy(false);
        busyRef.current = false;
      }
      operation.dispose();
    }
  };
  const profile = (userID: string) => {
    if (!isScopeCurrent()) return;
    leave(onClose);
    emit("OPEN_USER_CARD", { userID, groupID: conversation?.groupID });
  };
  const isCurrentMember = () => {
    const member = useConversationStore.getState().currentMemberInGroup;
    return member?.groupID === conversation?.groupID && !!member?.userID;
  };
  const contact = contacts.find((c) => c.userID === conversation?.userID)?.contact;
  return (
    <Drawer
      title="聊天信息"
      open={open}
      onClose={() => leave(onClose)}
      width={300}
      rootClassName="desktop-chat-drawer"
      mask={false}
    >
      <div className="desktop-chat-members">
        {conversation?.groupID
          ? members.map((member) => (
              <button
                type="button"
                key={member.userID}
                onClick={() => profile(member.userID)}
                title={member.nickname}
              >
                <OIMAvatar size={42} src={member.faceURL} text={member.nickname} />
                <span>{member.nickname}</span>
              </button>
            ))
          : conversation?.userID && (
              <button type="button" onClick={() => profile(conversation.userID)}>
                <OIMAvatar
                  size={42}
                  src={conversation.faceURL}
                  text={contact?.displayName || conversation.showName}
                />
                <span>{contact?.displayName || conversation.showName}</span>
              </button>
            )}
        {(!conversation?.groupID || inGroup) && (
          <button
            type="button"
            aria-label={conversation?.groupID ? "邀请成员" : "发起群聊"}
            onClick={() => {
              if (!isScopeCurrent()) return;
              if (conversation?.groupID && !isCurrentMember()) return;
              leave(onClose);
              emit("OPEN_CHOOSE_MODAL", {
                type: conversation?.groupID ? "INVITE_TO_GROUP" : "CRATE_GROUP",
                extraData: conversation?.groupID || [{ ...conversation }],
              });
            }}
          >
            <span className="desktop-chat-member-add">
              <PlusOutlined />
            </span>
            <span>{conversation?.groupID ? "邀请" : "群聊"}</span>
          </button>
        )}
      </div>
      {conversation?.groupID && (
        <p className="desktop-history-scope">
          {group?.memberCount ? `${group.memberCount} 位成员` : "群聊成员"}
        </p>
      )}
      {busy && <Spin size="small" />}
      {memberError && (
        <p role="alert" className="desktop-chat-error">
          {memberError}{" "}
          <Button size="small" onClick={() => void loadMembers(members.length)}>
            重试
          </Button>
        </p>
      )}
      {more && (
        <Button
          size="small"
          disabled={busy}
          onClick={() => void loadMembers(members.length)}
        >
          更多成员
        </Button>
      )}
      <div className="desktop-chat-detail-section">
        <button
          type="button"
          className="desktop-chat-detail-link"
          onClick={() => {
            if (isScopeCurrent()) leave(onSearch);
          }}
        >
          <SearchOutlined />
          <span>查找聊天内容</span>
          <RightOutlined />
        </button>
        {contact?.profile.introduction && (
          <p className="desktop-chat-introduction">{contact.profile.introduction}</p>
        )}
      </div>
      <div className="desktop-chat-detail-section">
        <label className="desktop-chat-detail-setting">
          <span>消息免打扰</span>
          <Switch
            aria-label="消息免打扰"
            size="small"
            disabled={busy}
            checked={conversation?.recvMsgOpt !== MessageReceiveOption.Receive}
            onChange={(value) => void change("mute", value)}
          />
        </label>
        <label className="desktop-chat-detail-setting">
          <span>置顶聊天</span>
          <Switch
            aria-label="置顶聊天"
            size="small"
            disabled={busy || isCoordinator}
            checked={!!conversation?.isPinned || isCoordinator}
            onChange={(value) => void change("pin", value)}
          />
        </label>
        {isCoordinator && <p className="desktop-history-scope">个人助理固定置顶</p>}
        {error && (
          <p role="alert" className="desktop-chat-error">
            {error}
          </p>
        )}
      </div>
      {isCoordinator && (
        <button
          type="button"
          className="desktop-chat-detail-link"
          onClick={() => {
            if (isScopeCurrent()) leave(onAboutMe);
          }}
        >
          <span>关于我与长期记忆</span>
          <RightOutlined />
        </button>
      )}
      {conversation?.groupID && inGroup && (
        <button
          type="button"
          className="desktop-chat-detail-link"
          onClick={() => {
            if (isScopeCurrent() && isCurrentMember()) leave(onManage);
          }}
        >
          <span>群管理</span>
          <RightOutlined />
        </button>
      )}
    </Drawer>
  );
}
