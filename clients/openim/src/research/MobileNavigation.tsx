import { Button, Dropdown } from "antd";
import { useNavigate } from "react-router-dom";
import { useUserStore } from "@/store";
import { emit } from "@/utils/events";
import { useResearchStore } from "./store";
import { useState } from "react";
import { LabSettings } from "./LabSettings";

export function MobileNavigation(){
  const navigate=useNavigate(),[settings,setSettings]=useState(false);
  const actor=useResearchStore(s=>s.actor);
  return <div className="hidden max-[600px]:flex shrink-0 h-11 items-center justify-between bg-white border-b px-2">
    <Button type="text" onClick={()=>navigate('/chat')}>会话</Button><Button type="text" onClick={()=>navigate('/contact')}>联系人</Button><Dropdown menu={{items:[{key:'requests',label:'联系人申请'},{key:'invitations',label:'群邀请与任务'},{key:'profile',label:'我的资料'},...(actor?.isLabManager?[{key:'settings',label:'实验室设置'}]:[]),{key:'logout',label:'退出登录'}],onClick:({key})=>{if(key==='requests')navigate('/contact/newFriends');else if(key==='invitations')navigate('/contact/groupNotifications');else if(key==='profile')emit('OPEN_USER_CARD',{isSelf:true,userID:useUserStore.getState().selfInfo.userID});else if(key==='settings')setSettings(true);else void useUserStore.getState().userLogout().catch(()=>{});}}}><Button type="text">更多</Button></Dropdown><LabSettings open={settings} onClose={()=>setSettings(false)}/>
  </div>;
}
