import { SessionType } from "@openim/wasm-client-sdk";
import { Button, Layout, Tooltip } from "antd";
import clsx from "clsx";
import i18n, { t } from "i18next";
import { memo, useEffect, useRef, useState } from "react";

import group_member from "@/assets/images/chatHeader/group_member.png";
import launch_group from "@/assets/images/chatHeader/launch_group.png";
import settings from "@/assets/images/chatHeader/settings.png";
import OIMAvatar from "@/components/OIMAvatar";
import { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { useConversationStore, useUserStore } from "@/store";
import { emit } from "@/utils/events";

import GroupSetting from "../GroupSetting";
import SingleSetting from "../SingleSetting";
import { researchMode } from "@/research/api";
import { useResearchStore } from "@/research/store";
import { PersonalAssistantPanel } from "@/research/PersonalAssistantPanel";
import { MoreOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import ChatDetailsDrawer from "./ChatDetailsDrawer";
import HistorySearch from "./HistorySearch";

const menuList = [
  {
    title: t("placeholder.createGroup"),
    icon: launch_group,
    idx: 0,
  },
  {
    title: t("placeholder.invitation"),
    icon: launch_group,
    idx: 1,
  },
  {
    title: t("placeholder.setting"),
    icon: settings,
    idx: 2,
  },
];

i18n.on("languageChanged", () => {
  menuList[0].title = t("placeholder.createGroup");
  menuList[1].title = t("placeholder.invitation");
  menuList[2].title = t("placeholder.setting");
});

const ChatHeader = () => {
  const [aboutMe, setAboutMe] = useState(false);
  const [details, setDetails] = useState(false);
  const [history, setHistory] = useState(false);
  const singleSettingRef = useRef<OverlayVisibleHandle>(null);
  const groupSettingRef = useRef<OverlayVisibleHandle>(null);

  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const currentGroupInfo = useConversationStore((state) => state.currentGroupInfo);
  const coordinator = useResearchStore((s) => s.session?.coordinator);
  const contact = useResearchStore(
    (s) => s.contacts.find((c) => c.userID === currentConversation?.userID)?.contact,
  );
  const isCoordinator =
    coordinator?.imConversationID === currentConversation?.conversationID;
  const currentUserIsInGroup = useConversationStore((state) =>
    Boolean(state.currentMemberInGroup?.userID),
  );
  const inGroup = useConversationStore((state) =>
    Boolean(state.currentMemberInGroup?.groupID),
  );

  // locale re render
  useUserStore((state) => state.appSettings.locale);

  useEffect(() => {
    setDetails(false);
    setHistory(false);
    setAboutMe(false);
    if (singleSettingRef.current?.isOverlayOpen) {
      singleSettingRef.current?.closeOverlay();
    }
    if (groupSettingRef.current?.isOverlayOpen) {
      groupSettingRef.current?.closeOverlay();
    }
  }, [currentConversation?.conversationID]);

  const menuClick = (idx: number) => {
    switch (idx) {
      case 0:
      case 1:
        emit("OPEN_CHOOSE_MODAL", {
          type: isSingleSession ? "CRATE_GROUP" : "INVITE_TO_GROUP",
          extraData: isSingleSession
            ? [{ ...currentConversation }]
            : currentConversation?.groupID,
        });
        break;
      case 2:
        if (window.electronAPI) {
          setDetails(true);
          break;
        }
        if (researchMode && !isGroupSession) {
          emit("OPEN_USER_CARD", { userID: currentConversation?.userID });
          break;
        }
        if (isGroupSession) {
          groupSettingRef.current?.openOverlay();
        } else {
          singleSettingRef.current?.openOverlay();
        }
        break;
      default:
        break;
    }
  };

  const isSingleSession = currentConversation?.conversationType === SessionType.Single;
  const isGroupSession = currentConversation?.conversationType === SessionType.Group;

  return (
    <Layout.Header className="desktop-chat-header relative border-b border-b-[var(--gap-text)] !bg-white !px-3">
      <div className="flex h-full items-center leading-none">
        <div className="flex flex-1 items-center overflow-hidden">
          {!window.electronAPI && (
            <OIMAvatar
              src={currentConversation?.faceURL}
              text={currentConversation?.showName}
              isgroup={Boolean(currentConversation?.groupID)}
              size={42}
            />
          )}
          <div
            className={clsx(
              "desktop-chat-heading ml-3 flex !h-10.5 flex-1 flex-col justify-between overflow-hidden",
            )}
          >
            <div className="truncate text-base font-semibold">
              {contact?.displayName || currentConversation?.showName}
            </div>
            {!window.electronAPI && !isGroupSession && contact && (
              <div className="truncate text-xs text-slate-500">
                {contact.identity.kind === "human"
                  ? contact.username
                    ? `@${contact.username}`
                    : "真人"
                  : isCoordinator
                  ? "你的个人助理 · 聊天、文件与协作"
                  : contact.profile.introduction || "AI 联系人 · 可以直接聊天"}
              </div>
            )}
            {!window.electronAPI && isGroupSession && currentUserIsInGroup && (
              <div className="flex items-center text-xs text-[var(--sub-text)]">
                <img width={20} src={group_member} alt="member" />
                <span>{currentGroupInfo?.memberCount}</span>
              </div>
            )}
          </div>
        </div>
        <div className="mr-2 flex items-center">
          {researchMode && isCoordinator && !window.electronAPI && (
            <Button
              className="desktop-about-me"
              type="text"
              size="small"
              icon={<UserOutlined />}
              onClick={() => setAboutMe(true)}
            >
              关于我
            </Button>
          )}
          {menuList.map((menu) => {
            if (window.electronAPI && menu.idx !== 2) return null;
            if (menu.idx === 1 && (isSingleSession || (!inGroup && !isSingleSession))) {
              return null;
            }
            if (menu.idx === 0 && !isSingleSession) {
              return null;
            }

            return (
              <Tooltip title={menu.title} key={menu.idx}>
                {window.electronAPI ? (
                  <button
                    type="button"
                    className="desktop-chat-header-action"
                    aria-label={menu.title}
                    onClick={() => menuClick(menu.idx)}
                  >
                    {menu.idx === 2 ? <MoreOutlined /> : <TeamOutlined />}
                  </button>
                ) : (
                  <img
                    className="ml-5 cursor-pointer"
                    width={20}
                    src={menu.icon}
                    alt=""
                    onClick={() => menuClick(menu.idx)}
                  />
                )}
              </Tooltip>
            );
          })}
        </div>
      </div>
      <SingleSetting ref={singleSettingRef} />
      <GroupSetting ref={groupSettingRef} />
      {window.electronAPI && (
        <>
          <ChatDetailsDrawer
            key={`details:${currentConversation?.conversationID}`}
            open={details}
            onClose={() => setDetails(false)}
            onSearch={() => {
              setDetails(false);
              setHistory(true);
            }}
            onAboutMe={() => {
              setDetails(false);
              setAboutMe(true);
            }}
            onManage={() => {
              setDetails(false);
              groupSettingRef.current?.openOverlay();
            }}
          />
          <HistorySearch
            key={`history:${currentConversation?.conversationID}`}
            open={history}
            onClose={() => setHistory(false)}
          />
        </>
      )}
      {researchMode && (
        <PersonalAssistantPanel open={aboutMe} onClose={() => setAboutMe(false)} />
      )}
    </Layout.Header>
  );
};

export default memo(ChatHeader);
