import { PlusOutlined, RobotOutlined, TeamOutlined, UserAddOutlined } from "@ant-design/icons";
import { Popover } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { emit } from "@/utils/events";

export default function NewConversationButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" arrow={false}
    content={<div className="desktop-new-menu" role="menu" aria-label="新建与添加菜单">
      <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate("/contact?action=add-contact"); }}><UserAddOutlined />添加联系人</button>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate("/contact?action=create-agent"); }}><RobotOutlined />创建或接入 Agent</button>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); emit("OPEN_CHOOSE_MODAL", { type: "CRATE_GROUP" }); }}><TeamOutlined />发起群聊</button>
    </div>}>
    <button type="button" className="desktop-new-conversation" aria-label="新建与添加" aria-haspopup="menu" aria-expanded={open}><PlusOutlined /></button>
  </Popover>;
}
