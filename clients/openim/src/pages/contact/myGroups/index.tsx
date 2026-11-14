import { GroupItem } from "@openim/wasm-client-sdk/lib/types/entity";
import { Button, Empty, Select } from "antd";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";

import { useContactStore, useUserStore } from "@/store";
import { emit } from "@/utils/events";

import GroupListItem from "./GroupListItem";

export enum GroupTypeEnum {
  JoinedGroup,
  CreatedGroup,
  AllGroups,
}

export const MyGroups = () => {
  const { t } = useTranslation();
  const [selectGroup, setSelectGroup] = useState(GroupTypeEnum.AllGroups);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useContactStore((state) => state.getGroupListByReq);

  const joinedGroupList = useContactStore((state) => state.groupList);
  const { userID } = useUserStore((state) => state.selfInfo);

  const handleChange = (value: string) => {
    setSelectGroup(Number(value));
  };

  const filterGroup = joinedGroupList.filter((group) => {
    if (selectGroup === GroupTypeEnum.JoinedGroup) {
      return group.creatorUserID !== userID;
    } else if (selectGroup === GroupTypeEnum.CreatedGroup) {
      return group.creatorUserID === userID;
    }
    return selectGroup === GroupTypeEnum.AllGroups;
  });

  const showGroupCard = useCallback((group: GroupItem) => {
    emit("OPEN_GROUP_CARD", group);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="m-5.5 flex flex-row justify-between">
        <p className="text-base font-extrabold">{t("placeholder.myGroup")}</p>
        <Select
          value={String(selectGroup)}
          aria-label="群聊范围"
          popupClassName="p-0"
          style={{ width: 200 }}
          onChange={handleChange}
          options={[
            { value: String(GroupTypeEnum.AllGroups), label: "全部群聊" },
            {
              value: String(GroupTypeEnum.CreatedGroup),
              label: t("placeholder.myCreated"),
            },
            {
              value: String(GroupTypeEnum.JoinedGroup),
              label: t("placeholder.myJoined"),
            },
          ]}
        />
      </div>
      <div className="box-border flex-1 overflow-y-auto px-2 pb-3">
        {!filterGroup.length ? (
          <div className="my-groups-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                selectGroup === GroupTypeEnum.CreatedGroup
                  ? "你还没有创建群聊"
                  : selectGroup === GroupTypeEnum.JoinedGroup
                  ? "暂时没有其他人创建的群聊"
                  : "本机列表中还没有群聊"
              }
            />
            <Button
              loading={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await refresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              刷新群聊
            </Button>
          </div>
        ) : (
          <Virtuoso
            className="h-full overflow-x-hidden"
            data={filterGroup}
            itemContent={(_, group) => (
              <GroupListItem
                key={group.groupID}
                source={group}
                showGroupCard={showGroupCard}
              />
            )}
          />
        )}
      </div>
    </div>
  );
};
