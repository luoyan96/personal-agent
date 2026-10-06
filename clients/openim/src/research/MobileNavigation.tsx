import { Button, Dropdown } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useUserStore } from "@/store";
import { emit } from "@/utils/events";
import { useResearchStore } from "./store";
import { useState } from "react";
import { LabSettings } from "./LabSettings";

export function MobileNavigation() {
  const navigate = useNavigate(),
    [settings, setSettings] = useState(false);
  return (
    <div className="hidden h-11 shrink-0 items-center justify-between border-b bg-white px-2 max-[600px]:flex">
      <Button type="text" onClick={() => navigate("/chat")}>
        会话
      </Button>
      <Button type="text" onClick={() => navigate("/contact")}>
        联系人
      </Button>
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            { key: "friend", label: "添加联系人" },
            { key: "group", label: "发起群聊" },
          ],
          onClick: ({ key }) => {
            if (key === "friend") navigate("/contact?action=add-contact");
            else emit("OPEN_CHOOSE_MODAL", { type: "CRATE_GROUP" });
          },
        }}
      >
        <Button type="text" aria-label="新建与添加" icon={<PlusOutlined />} />
      </Dropdown>
      <Dropdown
        menu={{
          items: [
            { key: "requests", label: "联系人申请" },
            { key: "invitations", label: "群邀请与任务" },
            { key: "profile", label: "我的资料" },
            { key: "settings", label: "模型设置" },
            { key: "logout", label: "退出登录" },
          ],
          onClick: ({ key }) => {
            if (key === "requests") navigate("/contact/newFriends");
            else if (key === "invitations") navigate("/contact/groupNotifications");
            else if (key === "profile")
              emit("OPEN_USER_CARD", {
                isSelf: true,
                userID: useUserStore.getState().selfInfo.userID,
              });
            else if (key === "settings") setSettings(true);
            else
              void useUserStore
                .getState()
                .userLogout()
                .catch(() => {});
          },
        }}
      >
        <Button type="text">更多</Button>
      </Dropdown>
      <LabSettings open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
