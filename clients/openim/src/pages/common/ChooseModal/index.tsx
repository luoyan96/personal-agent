import { CloseOutlined } from "@ant-design/icons";
import { GroupType, SessionType } from "@openim/wasm-client-sdk";
import { Alert, Button, Input, Modal, Upload, UploadProps } from "antd";
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
import { usePersonalOperation } from "@/research/usePersonalOperation";

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
  const sending = useRef(false);
  const requestTicket = useRef(0);
  const [createdGroupId, setCreatedGroupId] = useState<string>();
  const [failure, setFailure] = useState("");
  const operationScope = usePersonalOperation(
    isOverlayOpen,
    `group-choose:${type}:${typeof extraData === "string" ? extraData : ""}`,
  );
  const [groupBaseInfo, setGroupBaseInfo] = useState({
    groupName: "",
    groupAvatar: "",
  });

  const { toSpecifiedConversation } = useConversationToggle();

  const resetState = useCallback(() => {
    chooseBoxRef.current?.resetState();
    setCreatedGroupId(undefined);
    requestTicket.current++;
    sending.current = false;
    setLoading(false);
    setFailure("");
    setGroupBaseInfo({
      groupName: "",
      groupAvatar: "",
    });
  }, []);

  useEffect(() => resetState(), [operationScope.scope, resetState]);

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
    if (sending.current) return;
    const operation = operationScope.capture();
    const choosedList = chooseBoxRef.current?.getCheckedList() ?? [];
    if (!choosedList?.length && type !== "SELECT_USER")
      return message.warning(t("toast.selectLeastOne"));

    if (!groupBaseInfo.groupName.trim() && type === "CRATE_GROUP")
      return message.warning(t("toast.inputGroupName"));
    if (researchMode && type === "CRATE_GROUP" && choosedList.length > 20)
      return message.warning("一次建群最多选择20位成员。");

    setLoading(true);
    setFailure("");
    sending.current = true;
    const ticket = ++requestTicket.current;
    try {
      if (researchMode && type !== "SELECT_USER") {
        await useResearchStore.getState().refresh();
        if (!operation.isCurrent()) return;
        const contactIds = choosedList.map(
          (item) =>
            item.contactId ||
            useResearchStore
              .getState()
              .contacts.find((contact) => contact.userID === item.userID)?.contact.id,
        );
        if (contactIds.some((id) => !id))
          throw new Error("选中成员包含平台系统账户或不可用联系人，请重新选择");
        const ids = contactIds as string[];
        if (type === "CRATE_GROUP") {
          const groupId =
            createdGroupId ||
            (
              await researchApi("imCreateGroup", {
                body: {
                  title: groupBaseInfo.groupName.trim(),
                  contactIds: ids,
                  sharedContext: { selectedText: null, artifactRefs: [] },
                  plan: null,
                },
              })
            ).data.id;
          if (!operation.isCurrent()) return;
          setCreatedGroupId(groupId);
          const mapping = (
            await researchApi("imSyncConversation", {
              params: { id: groupId },
              body: {},
            })
          ).data;
          if (!operation.isCurrent()) return;
          await useResearchStore.getState().refresh();
          if (!operation.isCurrent()) return;
          if (mapping.transportStatus !== "ready" || !mapping.groupID)
            throw new Error(
              `科研群已创建，即时通信同步未完成（${
                mapping.reason || mapping.transportStatus
              }）。可以重试同步。`,
            );
          message.success("群聊已创建，成员已直接入群");
          await toSpecifiedConversation({
            sourceID: mapping.groupID,
            sessionType: SessionType.Group,
          });
        } else {
          const mapping = useResearchStore
            .getState()
            .mappings.find((item) => item.groupID === extraData);
          if (!mapping) throw new Error("没有这个群的科研权限");
          for (const contactId of ids) {
            const canonical = (
              await researchApi("chatConversation", {
                params: { id: mapping.researchConversationId },
              })
            ).data;
            if (!operation.isCurrent()) return;
            if (type === "INVITE_TO_GROUP") {
              if (!canonical.allowedActions.includes("invite"))
                throw new Error("仅群主可以邀请成员。");
              // Only an existing member is skipped. A legacy pending invite can
              // be selected again and becomes a joined member immediately.
              if (
                canonical.members.some(
                  (m) => m.contactId === contactId && m.status === "joined",
                )
              )
                continue;
              await researchApi("imInviteContact", {
                params: { id: canonical.id },
                body: { contactId, expectedConversationVersion: canonical.version },
              });
            } else if (type === "KICK_FORM_GROUP") {
              const member = canonical.members.find(
                (item) => item.contactId === contactId,
              );
              if (!member) throw new Error("选中身份不在当前成员列表");
              await researchApi("revokeChatMember", {
                params: { id: canonical.id, contactId },
                body: {
                  expectedVersion: member.version,
                  expectedConversationVersion: canonical.version,
                  reason: "负责人通过群成员管理移除成员；既有任务承接独立处理",
                },
              });
            } else
              throw new Error(
                "科研群负责人通过实验室权限管理；不能直接转移 IM 群主身份",
              );
          }
          if (!operation.isCurrent()) return;
          await researchApi("imSyncConversation", {
            params: { id: mapping.researchConversationId },
            body: {},
          });
          if (!operation.isCurrent()) return;
          if (type === "INVITE_TO_GROUP")
            message.success("已加入群聊");
        }
        closeOverlay();
        return;
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
      if (!researchMode || operation.isCurrent()) {
        setFailure(error instanceof Error ? error.message : "操作未完成，请重试。");
        feedbackToast({ error });
      }
      return;
    } finally {
      if (ticket === requestTicket.current) {
        sending.current = false;
        if (!researchMode || operation.isCurrent()) setLoading(false);
      }
    }
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
        <div className="px-6 pt-4" aria-busy={loading}>
          <div className="mb-6 flex items-center">
            <div className="min-w-[60px] font-medium">{t("placeholder.groupName")}</div>
            <Input
              placeholder={t("placeholder.pleaseEnter")}
              maxLength={16}
              spellCheck={false}
              value={groupBaseInfo.groupName}
              disabled={loading || !!createdGroupId}
              onChange={(e) =>
                setGroupBaseInfo((state) => ({ ...state, groupName: e.target.value }))
              }
            />
          </div>
          {!researchMode && (
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
          )}
          {createdGroupId && (
            <p className="mb-3 text-sm" role="status">
              群聊已创建。如同步未完成，请重试同步，不会重复建群。
            </p>
          )}
          <fieldset
            disabled={loading || !!createdGroupId}
            className={clsx(
              "m-0 flex min-w-0 border-0 p-0",
              (loading || createdGroupId) && "pointer-events-none opacity-60",
            )}
          >
            <div className="min-w-[60px] font-medium">
              {t("placeholder.groupMember")}
            </div>
            <ChooseBox
              className={clsx("!m-0 !h-[40vh] flex-1")}
              ref={chooseBoxRef}
              researchGroupPick={researchMode}
              disabled={loading || !!createdGroupId}
            />
          </fieldset>
        </div>
      ) : (
        <ChooseBox
          className="!h-[60vh]"
          ref={chooseBoxRef}
          isCheckInGroup={isCheckInGroup}
          showGroupMember={onlyMemberTypes.includes(type)}
          chooseOneOnly={onlyOneTypes.includes(type)}
          checkMemberRole={type === "KICK_FORM_GROUP"}
          researchGroupPick={researchMode && type === "INVITE_TO_GROUP"}
          groupID={
            type === "INVITE_TO_GROUP" && typeof extraData === "string"
              ? extraData
              : undefined
          }
          disabled={loading}
        />
      )}
      {failure && <Alert className="mx-6 mt-3" type="error" message={failure} />}
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
          {createdGroupId ? "重试同步" : t("confirm")}
        </Button>
      </div>
    </>
  );
};
