import { CompassOutlined, ContactsOutlined, FolderOpenOutlined, MessageOutlined, RightOutlined } from "@ant-design/icons";
import { Badge, Divider, Layout, Popover, Upload, UploadProps } from "antd";
import clsx from "clsx";
import i18n, { t } from "i18next";
import React, { memo, useRef, useState } from "react";
import ImageResizer from "react-image-file-resizer";
import { useLocation, useNavigate } from "react-router-dom";

import { modal } from "@/AntdGlobalComp";
import { updateBusinessUserInfo } from "@/api/login";
import contact_icon from "@/assets/images/nav/nav_bar_contact.png";
import contact_icon_active from "@/assets/images/nav/nav_bar_contact_active.png";
import message_icon from "@/assets/images/nav/nav_bar_message.png";
import message_icon_active from "@/assets/images/nav/nav_bar_message_active.png";
import change_avatar from "@/assets/images/profile/change_avatar.png";
import OIMAvatar from "@/components/OIMAvatar";
import { useContactStore, useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { emit } from "@/utils/events";
import { uploadFile } from "@/utils/imCommon";

import { OverlayVisibleHandle } from "../../hooks/useOverlayVisible";
import About from "./About";
import styles from "./left-nav-bar.module.scss";
import PersonalSettings from "./PersonalSettings";
import DesktopSettings from "./DesktopSettings";
import { researchMode } from "@/research/api";
import { LabSettings } from "@/research/LabSettings";
import { PersonalAssistantPanel } from "@/research/PersonalAssistantPanel";

const { Sider } = Layout;

const NavList = [
  {
    icon: message_icon,
    icon_active: message_icon_active,
    title: t("placeholder.chat"),
    path: "/chat",
  },
  {
    icon: contact_icon,
    icon_active: contact_icon_active,
    title: t("placeholder.contact"),
    path: "/contact",
  },
  {
    icon: contact_icon,
    icon_active: contact_icon_active,
    title: "工作台",
    path: "/workbench",
  },
  {
    icon: contact_icon,
    icon_active: contact_icon_active,
    title: "广场",
    path: "/square",
  },
];

i18n.on("languageChanged", () => {
  NavList[0].title = t("placeholder.chat");
  NavList[1].title = t("placeholder.contact");
});

const resizeFile = (file: File): Promise<File> =>
  new Promise((resolve) => {
    ImageResizer.imageFileResizer(
      file,
      400,
      400,
      "webp",
      90,
      0,
      (uri) => {
        resolve(uri as File);
      },
      "file",
    );
  });

type NavItemType = (typeof NavList)[0];

const NavItem = ({ nav: { icon, icon_active, title, path } }: { nav: NavItemType }) => {
  const navigate = useNavigate();
  const locationPathname = useLocation().pathname;
  const isActive =
    locationPathname === path || locationPathname.startsWith(`${path}/`);

  const unReadCount = useConversationStore((state) => state.unReadCount);
  const unHandleFriendApplicationCount = useContactStore(
    (state) => state.unHandleFriendApplicationCount,
  );
  const unHandleGroupApplicationCount = useContactStore(
    (state) => state.unHandleGroupApplicationCount,
  );

  const tryNavigate = () => {
    if (isActive) {
      return;
    }

    navigate(path);
  };

  const getBadge = () => {
    if (path === "/chat") {
      return unReadCount;
    }
    if (path === "/contact") {
      return unHandleFriendApplicationCount + unHandleGroupApplicationCount;
    }
    return 0;
  };

  return (
    <Badge size="small" count={getBadge()}>
      <button
        type="button"
        aria-label={title}
        aria-current={isActive ? "page" : undefined}
        className={clsx(
          "desktop-nav-item mb-3 flex h-[52px] w-12 cursor-pointer flex-col items-center justify-center rounded-md",
          { "bg-[#e9e9eb]": isActive },
        )}
        onClick={tryNavigate}
      >
        {window.electronAPI || path === "/workbench" || path === "/square" ? (
          path === "/chat" ? <MessageOutlined /> : path === "/contact" ? <ContactsOutlined /> : path === "/workbench" ? <FolderOpenOutlined /> : <CompassOutlined />
        ) : <img width={20} src={isActive ? icon_active : icon} alt="" />}
        <div className="mt-1 text-xs text-gray-500">{title}</div>
      </button>
    </Badge>
  );
};

const profileMenuList = [
  {
    title: t("placeholder.myInfo"),
    gap: true,
    idx: 0,
  },
  {
    title: t("placeholder.accountSetting"),
    gap: true,
    idx: 1,
  },
  {
    title: t("placeholder.about"),
    gap: false,
    idx: 2,
  },
  {
    title: t("placeholder.logOut"),
    gap: false,
    idx: 3,
  },
  { title: "记忆与跟进", gap: true, idx: 4 },
];

i18n.on("languageChanged", () => {
  profileMenuList[0].title = t("placeholder.myInfo");
  profileMenuList[1].title = t("placeholder.accountSetting");
  profileMenuList[2].title = t("placeholder.about");
  profileMenuList[3].title = t("placeholder.logOut");
});

const LeftNavBar = memo(() => {
  const aboutRef = useRef<OverlayVisibleHandle>(null);
  const personalSettingsRef = useRef<OverlayVisibleHandle>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [labSettings, setLabSettings] = useState(false);
  const [personal, setPersonal] = useState(false);
  const [personalTab, setPersonalTab] = useState<"memory" | "followups">("memory");
  const selfInfo = useUserStore((state) => state.selfInfo);
  const userLogout = useUserStore((state) => state.userLogout);
  const updateSelfInfo = useUserStore((state) => state.updateSelfInfo);

  const profileMenuClick = (idx: number) => {
    switch (idx) {
      case 0:
        emit("OPEN_USER_CARD", {
          isSelf: true,
          userID: useUserStore.getState().selfInfo.userID,
        });
        break;
      case 1:
        if (researchMode) setLabSettings(true); else personalSettingsRef.current?.openOverlay();
        break;
      case 2:
        aboutRef.current?.openOverlay();
        break;
      case 3:
        tryLogout();
        break;
      case 4:
        setPersonalTab("memory"); setPersonal(true);
        break;
      default:
        break;
    }
    setShowProfile(false);
  };

  const tryLogout = () => {
    modal.confirm({
      title: t("placeholder.logOut"),
      content: t("toast.confirmlogOut"),
      onOk: async () => {
        try {
          await userLogout();
        } catch (error) {
          feedbackToast({ error });
        }
      },
    });
  };

  const customUpload: NonNullable<UploadProps["customRequest"]> = ({
    file,
    onError,
    onSuccess,
  }) => {
    if (!(file instanceof File)) return;
    void (async () => {
      try {
        const resizedFile = await resizeFile(file);
        const filePath = await window.electronAPI?.saveFileToDisk({
          sync: true,
          file,
        });
        const {
          data: { url },
        } = await uploadFile(resizedFile, filePath);
        const newInfo = {
          faceURL: url,
        };
        await updateBusinessUserInfo(newInfo);
        updateSelfInfo(newInfo);
        onSuccess?.(newInfo);
      } catch (error) {
        feedbackToast({ error: t("toast.updateAvatarFailed") });
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  };

  const ProfileContent = (
    <div className="w-72 px-2.5 pb-3 pt-5.5">
      <div className="mb-4.5 ml-3 flex items-center">
        <Upload
          disabled={researchMode}
          accept=".jpeg,.png,.webp"
          showUploadList={false}
          customRequest={customUpload}
        >
          <div className={styles["avatar-wrapper"]}>
            <OIMAvatar src={selfInfo.faceURL} text={selfInfo.nickname} />
            <div className={styles["mask"]}>
              <img src={change_avatar} width={19} alt="" />
            </div>
          </div>
        </Upload>
        <div className="flex-1 overflow-hidden">
          <div className="mb-1 truncate text-base font-medium">{selfInfo.nickname}</div>
        </div>
      </div>
      {profileMenuList.filter(menu => researchMode || menu.idx !== 4).map((menu) => (
        <div key={menu.idx}>
          <div
            className="flex cursor-pointer items-center justify-between rounded-md px-3 py-4 hover:bg-[var(--primary-active)]"
            onClick={() => profileMenuClick(menu.idx)}
          >
            <div>{researchMode && menu.idx === 1 ? "模型设置" : menu.title}</div>
            <RightOutlined rev={undefined} />
          </div>
          {menu.gap && (
            <div className="px-3">
              <Divider className="my-1.5 border-[var(--gap-text)]" />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Sider
      className="desktop-navigation no-mobile border-r border-gray-200 !bg-[#F4F4F4] dark:border-gray-800 dark:!bg-[#141414]"
      width={window.electronAPI ? 76 : 60}
      theme="light"
    >
      <div className="desktop-navigation-content mt-6 flex flex-col items-center">
        <Popover
          content={ProfileContent}
          trigger="click"
          placement="rightBottom"
          overlayClassName="profile-popover"
          title={null}
          arrow={false}
          open={showProfile}
          onOpenChange={(vis) => setShowProfile(vis)}
        >
          <OIMAvatar
            className="mb-6 cursor-pointer"
            src={selfInfo.faceURL}
            text={selfInfo.nickname}
          />
        </Popover>

        {NavList.filter(nav => researchMode || ["/chat", "/contact"].includes(nav.path)).map((nav) => (
          <NavItem nav={nav} key={nav.path} />
        ))}
        {window.electronAPI && <div className="desktop-navigation-bottom">
          <DesktopSettings
            onModelSettings={() => researchMode ? setLabSettings(true) : personalSettingsRef.current?.openOverlay()}
            onMemory={researchMode ? () => { setPersonalTab("memory"); setPersonal(true); } : undefined}
            onFollowups={researchMode ? () => { setPersonalTab("followups"); setPersonal(true); } : undefined}
          />
        </div>}
      </div>
      <PersonalSettings ref={personalSettingsRef} />
      <About ref={aboutRef} />
      <LabSettings open={labSettings} onClose={() => setLabSettings(false)} />
      {researchMode && <PersonalAssistantPanel open={personal} initialTab={personalTab} onClose={() => setPersonal(false)} />}
    </Sider>
  );
});

export default LeftNavBar;
