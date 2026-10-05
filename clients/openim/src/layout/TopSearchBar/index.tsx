import { MessageType, SdkEvent } from "@openim/wasm-client-sdk";
import {
  GroupItem,
  MessageItem,
  SdkEventEnvelope,
  SignalingInvitation,
} from "@openim/wasm-client-sdk/lib/types/entity";
import { Popover } from "antd";
import { PlusOutlined, RobotOutlined } from "@ant-design/icons";
import i18n, { t } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";

import { getBusinessUserInfo } from "@/api/login";
import add_friend from "@/assets/images/topSearchBar/add_friend.png";
import add_group from "@/assets/images/topSearchBar/add_group.png";
import create_group from "@/assets/images/topSearchBar/create_group.png";
import WindowControlBar from "@/components/WindowControlBar";
import { CustomType } from "@/constants";
import { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import ChooseModal, { ChooseModalState } from "@/pages/common/ChooseModal";
import GroupCardModal from "@/pages/common/GroupCardModal";
import RtcCallModal from "@/pages/common/RtcCallModal";
import { InviteData } from "@/pages/common/RtcCallModal/data";
import UserCardModal, { CardInfo } from "@/pages/common/UserCardModal";
import { useContactStore, useUserStore } from "@/store";
import emitter, { OpenUserCardParams } from "@/utils/events";
import { researchMode } from "@/research/api";
import { useNavigate } from "react-router-dom";

import { IMSDK } from "../MainContentWrap";
import SearchUserOrGroup from "./SearchUserOrGroup";

type UserCardState = OpenUserCardParams & {
  cardInfo?: CardInfo;
};

const isCallingInviteData = (
  value: unknown,
): value is { customType: CustomType; data: SignalingInvitation } => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { customType?: unknown; data?: unknown };
  return (
    candidate.customType === CustomType.CallingInvite &&
    Boolean(candidate.data) &&
    typeof candidate.data === "object"
  );
};

const TopSearchBar = () => {
  const navigate = useNavigate();
  const userCardRef = useRef<OverlayVisibleHandle>(null);
  const groupCardRef = useRef<OverlayVisibleHandle>(null);
  const chooseModalRef = useRef<OverlayVisibleHandle>(null);
  const searchModalRef = useRef<OverlayVisibleHandle>(null);
  const rtcRef = useRef<OverlayVisibleHandle>(null);
  const [chooseModalState, setChooseModalState] = useState<ChooseModalState>({
    type: "CRATE_GROUP",
  });
  const [userCardState, setUserCardState] = useState<UserCardState>();
  const [groupCardData, setGroupCardData] = useState<
    GroupItem & { inGroup?: boolean }
  >();
  const [actionVisible, setActionVisible] = useState(false);
  const [isSearchGroup, setIsSearchGroup] = useState(false);
  const [inviteData, setInviteData] = useState<InviteData>({} as InviteData);

  const openUserCardWithData = useCallback((cardInfo: CardInfo) => {
    searchModalRef.current?.closeOverlay();
    setUserCardState({
      userID: cardInfo.userID,
      cardInfo,
      isSelf: cardInfo.userID === useUserStore.getState().selfInfo.userID,
    });
    userCardRef.current?.openOverlay();
  }, []);

  const openGroupCardWithData = useCallback((group: GroupItem) => {
    searchModalRef.current?.closeOverlay();
    const inGroup = useContactStore
      .getState()
      .groupList.some((g) => g.groupID === group.groupID);
    setGroupCardData({ ...group, inGroup });
    groupCardRef.current?.openOverlay();
  }, []);

  useEffect(() => {
    const userCardHandler = (params: OpenUserCardParams) => {
      setUserCardState({ ...params });
      userCardRef.current?.openOverlay();
    };
    const chooseModalHandler = (params: ChooseModalState) => {
      setChooseModalState({ ...params });
      chooseModalRef.current?.openOverlay();
    };
    const callRtcHandler = (inviteData: InviteData) => {
      if (researchMode) return;
      if (rtcRef.current?.isOverlayOpen) return;
      setInviteData(inviteData);
      rtcRef.current?.openOverlay();
    };
    const newMessageHandler = ({ data }: SdkEventEnvelope<MessageItem[]>) => {
      if (researchMode) return;
      if (rtcRef.current?.isOverlayOpen) return;
      let rtcInvite: SignalingInvitation | undefined;
      data.forEach((message) => {
        if (
          message.contentType !== MessageType.CustomMessage ||
          !message.customElem?.data
        ) {
          return;
        }
        const customData = JSON.parse(message.customElem.data) as unknown;
        if (isCallingInviteData(customData)) rtcInvite = customData.data;
      });
      if (rtcInvite) {
        const invitation = rtcInvite;
        void getBusinessUserInfo([invitation.inviterUserID]).then(
          ({ data: { users } }) => {
            if (users.length === 0) return;
            setInviteData({
              invitation,
              participant: {
                userInfo: {
                  nickname: users[0].nickname,
                  faceURL: users[0].faceURL,
                  userID: users[0].userID,
                  ex: "",
                },
              },
            });
            rtcRef.current?.openOverlay();
          },
        );
      }
    };

    emitter.on("OPEN_USER_CARD", userCardHandler);
    emitter.on("OPEN_GROUP_CARD", openGroupCardWithData);
    emitter.on("OPEN_CHOOSE_MODAL", chooseModalHandler);
    emitter.on("OPEN_RTC_MODAL", callRtcHandler);
    IMSDK.on(SdkEvent.OnRecvNewMessages, newMessageHandler);
    return () => {
      emitter.off("OPEN_USER_CARD", userCardHandler);
      emitter.off("OPEN_GROUP_CARD", openGroupCardWithData);
      emitter.off("OPEN_CHOOSE_MODAL", chooseModalHandler);
      emitter.off("OPEN_RTC_MODAL", callRtcHandler);
      IMSDK.off(SdkEvent.OnRecvNewMessages, newMessageHandler);
    };
  }, [openGroupCardWithData]);

  const actionClick = (idx: number) => {
    if (researchMode) {
      if (idx === 0) navigate("/contact?view=search");
      if (idx === 1) navigate("/contact?action=create-agent");
      if (idx === 2) {
        setChooseModalState({ type: "CRATE_GROUP" });
        chooseModalRef.current?.openOverlay();
      }
      setActionVisible(false);
      return;
    }
    switch (idx) {
      case 0:
      case 1:
        setIsSearchGroup(Boolean(idx));
        searchModalRef.current?.openOverlay();
        break;
      case 2:
        setChooseModalState({ type: "CRATE_GROUP" });
        chooseModalRef.current?.openOverlay();
        break;
      default:
        break;
    }
    setActionVisible(false);
  };

  return (
    <div className="no-mobile app-drag flex h-10 min-h-[40px] items-center bg-[var(--top-search-bar)] dark:bg-[#141414]">
      <div className="flex w-full items-center justify-center">
        <div className="app-no-drag flex h-[26px] w-1/3 items-center justify-center rounded-md bg-[rgba(255,255,255,0.2)]"></div>
        <Popover
          content={<ActionPopContent actionClick={actionClick} research={researchMode} />}
          arrow={false}
          title={null}
          trigger="click"
          placement="bottom"
          open={actionVisible}
          onOpenChange={(vis) => setActionVisible(vis)}
        >
          <button
            type="button"
            className="app-no-drag ml-8 flex h-8 w-8 items-center justify-center rounded-md text-xl text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label="新建与添加"
            aria-expanded={actionVisible}
            aria-haspopup="menu"
          >
            <PlusOutlined />
          </button>
        </Popover>
      </div>
      <WindowControlBar />
      <UserCardModal ref={userCardRef} {...userCardState} />
      <GroupCardModal ref={groupCardRef} groupData={groupCardData} />
      <ChooseModal ref={chooseModalRef} state={chooseModalState} />
      <SearchUserOrGroup
        ref={searchModalRef}
        isSearchGroup={isSearchGroup}
        openUserCardWithData={openUserCardWithData}
        openGroupCardWithData={openGroupCardWithData}
      />
      <RtcCallModal ref={rtcRef} inviteData={inviteData} />
    </div>
  );
};

export default TopSearchBar;

const actionMenuList = [
  {
    idx: 0,
    title: t("placeholder.addFriends"),
    icon: add_friend,
  },
  {
    idx: 1,
    title: t("placeholder.addGroup"),
    icon: add_group,
  },
  {
    idx: 2,
    title: t("placeholder.createGroup"),
    icon: create_group,
  },
];

i18n.on("languageChanged", () => {
  actionMenuList[0].title = t("placeholder.addFriends");
  actionMenuList[1].title = t("placeholder.addGroup");
  actionMenuList[2].title = t("placeholder.createGroup");
});

const researchActionMenuList = [
  { idx: 0, title: "添加朋友", icon: add_friend },
  { idx: 1, title: "创建 Agent", icon: null },
  { idx: 2, title: "发起群聊", icon: create_group },
];

const ActionPopContent = ({ actionClick, research }: { actionClick: (idx: number) => void; research: boolean }) => {
  return (
    <div className="min-w-[160px] p-1" role="menu" aria-label="新建与添加菜单">
      {(research ? researchActionMenuList : actionMenuList).map((action) => (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center rounded px-3 py-3 text-sm hover:bg-[var(--primary-active)] focus-visible:bg-[var(--primary-active)]"
          key={action.idx}
          onClick={() => actionClick?.(action.idx)}
        >
          {action.icon ? <img width={20} src={action.icon} alt="" /> : <RobotOutlined className="text-xl text-[var(--primary)]" />}
          <div className="ml-3">{action.title}</div>
        </button>
      ))}
    </div>
  );
};
