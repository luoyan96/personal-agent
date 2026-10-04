import { CloseOutlined } from "@ant-design/icons";
import { GroupType, SessionType } from "@openim/wasm-client-sdk";
import { Button, Input, Modal, Upload, UploadProps } from "antd";
import clsx from "clsx";
import i18n, { t } from "i18next";
import {
  FC,
  forwardRef,
  ForwardRefRenderFunction,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { message } from "@/AntdGlobalComp";
import OIMAvatar from "@/components/OIMAvatar";
import { useConversationToggle } from "@/hooks/useConversationToggle";
import { OverlayVisibleHandle, useOverlayVisible } from "@/hooks/useOverlayVisible";
import { IMSDK } from "@/layout/MainContentWrap";
import { feedbackToast } from "@/utils/common";
import { emit } from "@/utils/events";
import { uploadFile } from "@/utils/imCommon";
import { researchApi, researchMode } from "@/research/api";
import { useResearchStore } from "@/research/store";

import ChooseBox, { ChooseBoxHandle } from "./ChooseBox";
import { CheckListItem } from "./ChooseBox/CheckItem";

export type ChooseModalType =
  | "CRATE_GROUP"
  | "INVITE_TO_GROUP"
  | "KICK_FORM_GROUP"
  | "TRANSFER_IN_GROUP"
  | "SELECT_USER";

export interface SelectUserExtraData {
  notConversation: boolean;
  list: CheckListItem[];
}

const isSelectUserExtraData = (value: unknown): value is SelectUserExtraData => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SelectUserExtraData>;
  return (
    typeof candidate.notConversation === "boolean" && Array.isArray(candidate.list)
  );
};

export interface ChooseModalState {
  type: ChooseModalType;
  extraData?: unknown;
}

interface IChooseModalProps {
  state: ChooseModalState;
}

const titleMap = {
  CRATE_GROUP: t("placeholder.createGroup"),
  INVITE_TO_GROUP: t("placeholder.invitation"),
  KICK_FORM_GROUP: t("placeholder.kickMember"),
  TRANSFER_IN_GROUP: t("placeholder.transferGroup"),
  SELECT_USER: t("placeholder.selectUser"),
};

i18n.on("languageChanged", () => {
  titleMap.CRATE_GROUP = t("placeholder.createGroup");
  titleMap.INVITE_TO_GROUP = t("placeholder.invitation");
  titleMap.KICK_FORM_GROUP = t("placeholder.kickMember");
  titleMap.TRANSFER_IN_GROUP = t("placeholder.transferGroup");
  titleMap.SELECT_USER = t("placeholder.selectUser");
});

const onlyOneTypes = ["TRANSFER_IN_GROUP"];
const onlyMemberTypes = ["KICK_FORM_GROUP", "TRANSFER_IN_GROUP"];

const ChooseModal: ForwardRefRenderFunction<OverlayVisibleHandle, IChooseModalProps> = (
  { state: { type, extraData } },
  ref,
) => {
  const { isOverlayOpen, closeOverlay } = useOverlayVisible(ref);

  return (
    <Modal
      title={null}
      footer={null}
      centered
      open={isOverlayOpen}
      closable={false}
      width={680}
      onCancel={closeOverlay}
      destroyOnClose
      styles={{
        mask: {
          opacity: 0,
          transition: "none",
        },
      }}
      className="no-padding-modal max-w-[80vw]"
      maskTransitionName=""
    >
      <ChooseContact
        isOverlayOpen={isOverlayOpen}
        type={type}
        extraData={extraData}
        closeOverlay={closeOverlay}
      />
    </Modal>
  );
};

export default memo(forwardRef(ChooseModal));

type ChooseContactProps = {
  isOverlayOpen: boolean;
  type: ChooseModalType;
  extraData?: unknown;
  closeOverlay: () => void;
};

export const ChooseContact: FC<ChooseContactProps> = ({
  isOverlayOpen,
  type,
  extraData,
  closeOverlay,
}) => {
  const chooseBoxRef = useRef<ChooseBoxHandle>(null);
  const [loading, setLoading] = useState(false);
  const [groupBaseInfo, setGroupBaseInfo] = useState({
    groupName: "",
    groupAvatar: "",
  });

  const { toSpecifiedConversation } = useConversationToggle();

  const resetState = useCallback(() => {
    chooseBoxRef.current?.resetState();
    setGroupBaseInfo({
      groupName: "",
      groupAvatar: "",
    });
  }, []);

  useEffect(() => {
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    if (isOverlayOpen && type === "CRATE_GROUP" && extraData) {
      updateTimer = setTimeout(
        () => chooseBoxRef.current?.updatePrevCheckList(extraData as CheckListItem[]),
        100,
      );
    }
    if (isOverlayOpen && type === "SELECT_USER" && extraData) {
      updateTimer = setTimeout(
        () =>
          chooseBoxRef.current?.updatePrevCheckList(
            (extraData as SelectUserExtraData).list,
          ),
        100,
      );
    }
    if (!isOverlayOpen) resetState();
    return () => clearTimeout(updateTimer);
  }, [extraData, isOverlayOpen, resetState, type]);

  const confirmChoose = async () => {
    const choosedList = chooseBoxRef.current?.getCheckedList() ?? [];
    if (!choosedList?.length && type !== "SELECT_USER")
      return message.warning(t("toast.selectLeastOne"));

    if (!groupBaseInfo.groupName.trim() && type === "CRATE_GROUP")
      return message.warning(t("toast.inputGroupName"));

    setLoading(true);
    try {
      if (researchMode && type !== "SELECT_USER") {
        await useResearchStore.getState().refresh();
        const contactIds = choosedList.map(item => useResearchStore.getState().contacts.find(contact => contact.userID === item.userID)?.contact.id);
        if (contactIds.some(id => !id)) throw new Error("选中成员包含平台系统账户或不可用联系人，请重新选择");
        const ids = contactIds as string[];
        if (type === "CRATE_GROUP") {
          const created = (await researchApi("imCreateGroup", {body:{title:groupBaseInfo.groupName.trim(),contactIds:ids,sharedContext:{selectedText:null,artifactRefs:[]},plan:null}})).data;
          const mapping = (await researchApi("imSyncConversation",{params:{id:created.id},body:{}})).data;
          await useResearchStore.getState().refresh();
          if (mapping.transportStatus !== "ready" || !mapping.groupID) throw new Error(`科研群已创建，即时通信同步未完成（${mapping.reason || mapping.transportStatus}）。可以重试同步，成员仍需独立同意邀请。`);
          await toSpecifiedConversation({sourceID:mapping.groupID,sessionType:SessionType.Group});
        } else {
          const mapping = useResearchStore.getState().mappings.find(item=>item.groupID===extraData);
          if (!mapping) throw new Error("没有这个群的科研权限");
          for (const contactId of ids) {
            const canonical = (await researchApi("chatConversation",{params:{id:mapping.researchConversationId}})).data;
            if (type === "INVITE_TO_GROUP") await researchApi("imInviteContact",{params:{id:canonical.id},body:{contactId,expectedConversationVersion:canonical.version}});
            else if (type === "KICK_FORM_GROUP") {
              const member = canonical.members.find(item=>item.contactId===contactId);
              if (!member) throw new Error("选中身份不在当前成员列表");
              await researchApi("revokeChatMember",{params:{id:canonical.id,contactId},body:{expectedVersion:member.version,expectedConversationVersion:canonical.version,reason:"负责人通过群成员管理移除成员；既有任务承接独立处理"}});
            } else throw new Error("科研群负责人通过实验室权限管理；不能直接转移 IM 群主身份");
          }
          await researchApi("imSyncConversation",{params:{id:mapping.researchConversationId},body:{}});
        }
        closeOverlay(); return;
      }
      switch (type) {
        case "CRATE_GROUP": {
          if (choosedList.length === 1) {
            const sourceID = choosedList[0].userID;
            if (!sourceID) break;
            await toSpecifiedConversation({
              sourceID,
              sessionType: SessionType.Single,
            });
            break;
          }
          const memberUserIDs = choosedList.flatMap((item) =>
            item.userID ? [item.userID] : [],
          );
          await IMSDK.createGroup({
            groupInfo: {
              groupType: GroupType.WorkingGroup,
              groupName: groupBaseInfo.groupName,
              faceURL: groupBaseInfo.groupAvatar,
            },
            memberUserIDs,
            adminUserIDs: [],
          });
          break;
        }
        case "INVITE_TO_GROUP":
          if (typeof extraData !== "string") break;
          await IMSDK.inviteUserToGroup({
            groupID: extraData,
            userIDList: choosedList.flatMap((item) =>
              item.userID ? [item.userID] : [],
            ),
            reason: "",
          });
          break;
        case "KICK_FORM_GROUP":
          if (typeof extraData !== "string") break;
          await IMSDK.kickGroupMember({
            groupID: extraData,
            userIDList: choosedList.flatMap((item) =>
              item.userID ? [item.userID] : [],
            ),
            reason: "",
          });
          break;
        case "TRANSFER_IN_GROUP":
          if (typeof extraData !== "string" || !choosedList[0]?.userID) break;
          await IMSDK.transferGroupOwner({
            groupID: extraData,
            newOwnerUserID: choosedList[0].userID,
          });
          break;
        case "SELECT_USER":
          if (!isSelectUserExtraData(extraData)) break;
          emit("SELECT_USER", {
            notConversation: extraData.notConversation,
            choosedList,
          });
          break;
        default:
          break;
      }
    } catch (error) {
      feedbackToast({ error });
    }
    setLoading(false);
    closeOverlay();
  };

  const customUpload: NonNullable<UploadProps["customRequest"]> = (options) => {
    if (!(options.file instanceof File)) return;
    const file = options.file;
    void (async () => {
      try {
        const {
          data: { url },
        } = await uploadFile(file);
        setGroupBaseInfo((prev) => ({ ...prev, groupAvatar: url }));
        options.onSuccess?.({ url });
      } catch (error) {
        feedbackToast({ error: t("toast.updateAvatarFailed") });
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  };

  const isCheckInGroup = type === "INVITE_TO_GROUP";

  return (
    <>
      <div className="flex h-16 items-center justify-between bg-[var(--gap-text)] px-7">
        <div>{titleMap[type]}</div>
        <CloseOutlined
          className="cursor-pointer text-[var(--sub-text)]"
          rev={undefined}
          onClick={closeOverlay}
        />
      </div>
      {type === "CRATE_GROUP" ? (
        <div className="px-6 pt-4">
          <div className="mb-6 flex items-center">
            <div className="min-w-[60px] font-medium">{t("placeholder.groupName")}</div>
            <Input
              placeholder={t("placeholder.pleaseEnter")}
              maxLength={16}
              spellCheck={false}
              value={groupBaseInfo.groupName}
              onChange={(e) =>
                setGroupBaseInfo((state) => ({ ...state, groupName: e.target.value }))
              }
            />
          </div>
          <div className="mb-6 flex items-center">
            <div className="min-w-[60px] font-medium">
              {t("placeholder.groupAvatar")}
            </div>
            <div className="flex items-center">
              <OIMAvatar src={groupBaseInfo.groupAvatar} isgroup />
              <Upload
                accept="image/*"
                showUploadList={false}
                customRequest={customUpload}
              >
                <span className="ml-3 cursor-pointer text-xs text-[var(--primary)]">
                  {t("placeholder.clickToModify")}
                </span>
              </Upload>
            </div>
          </div>
          <div className="flex">
            <div className="min-w-[60px] font-medium">
              {t("placeholder.groupMember")}
            </div>
            <ChooseBox className={clsx("!m-0 !h-[40vh] flex-1")} ref={chooseBoxRef} />
          </div>
        </div>
      ) : (
        <ChooseBox
          className="!h-[60vh]"
          ref={chooseBoxRef}
          isCheckInGroup={isCheckInGroup}
          showGroupMember={onlyMemberTypes.includes(type)}
          chooseOneOnly={onlyOneTypes.includes(type)}
          checkMemberRole={type === "KICK_FORM_GROUP"}
        />
      )}
      <div className="flex justify-end px-9 py-6">
        <Button
          className="mr-6 border-0 bg-[var(--chat-bubble)] px-6"
          onClick={closeOverlay}
        >
          {t("cancel")}
        </Button>
        <Button
          className="px-6"
          type="primary"
          loading={loading}
          onClick={() => void confirmChoose()}
        >
          {t("confirm")}
        </Button>
      </div>
    </>
  );
};
