import { Alert, Button, Form, Input, Space } from "antd";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { clearIMProfile, setIMProfile } from "@/utils/storage";
import { clearResearchSession, researchApi } from "./api";
import { useResearchStore } from "./store";
import { LabSettings } from "./LabSettings";
import { ResearchUserCard } from "./ResearchUserCard";
import { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";

export default function ResearchLogin() {
  const [registering, setRegistering] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const navigate = useNavigate();
  const connectionError = useResearchStore(s => s.error);
  const actor = useResearchStore(s => s.actor);
  const [settings, setSettings] = useState(false);
  const profile = useRef<OverlayVisibleHandle>(null);
  const connect = async () => {
    const actor = (await researchApi("session")).data;
    const session = (await researchApi("imSession", { body: { platformID: window.electronAPI ? 3 : 5 } })).data;
    useResearchStore.getState().setSession(session, actor);
    await useResearchStore.getState().refresh();
    if (session.status !== "available" || !session.user || !session.configuration) throw new Error(`科研账号已登录，即时通信暂不可用（${session.reason ?? "配置待核对"}）。请配置 OpenIM 服务后重新连接。`);
    await setIMProfile({ chatToken: "", imToken: session.user.imToken, userID: session.user.userID }); navigate("/chat");
  };
  useEffect(() => {
    if (location.protocol === 'file:') { setError('桌面客户端尚未配置科研服务入口。请使用 RESEARCH_APP_URL 指向获准的同源 HTTPS 页面；本机开发可使用 http://127.0.0.1:4317。'); return; }
    const expired = () => { useResearchStore.getState().clear(); setSettings(false); profile.current?.closeOverlay(); };
    window.addEventListener("research-session-expired", expired);
    void researchApi("session").then(async result => { const session = (await researchApi("imSession", {body:{platformID:window.electronAPI?3:5}})).data; useResearchStore.getState().setSession(session,result.data); await useResearchStore.getState().refresh(); }).catch(() => {});
    return () => window.removeEventListener("research-session-expired", expired);
  }, []);
  const login = async (values: { username: string; password: string; inviteCode?: string; displayName?: string }) => {
    setPending(true); setError("");
    try {
      if (registering) { await researchApi("register", { body: { username: values.username, password: values.password, inviteCode: values.inviteCode!, displayName: values.displayName! } }); setRegistering(false); setRegistered(true); return; }
      await researchApi("login", { body: { username: values.username, password: values.password } });
      await connect();
    } catch (err) { setError(err instanceof Error ? err.message : "登录失败，请检查服务连接"); }
    finally { setPending(false); }
  };
  return <div>
    {location.protocol === 'file:' ? <><h1 className="text-xl mb-3">科研微信</h1><Alert type="warning" showIcon message="科研服务入口尚未配置" description={error || '请配置 RESEARCH_APP_URL 后重新启动桌面客户端。'}/></> : <>
    {actor ? <div className="space-y-3"><h1 className="text-xl">科研账号已登录</h1><p>{actor.member.displayName}</p><Alert type="warning" showIcon message="即时通信未连接" description={error || connectionError || "连接成功后才能收发 OpenIM 消息；实验室设置和本人资料仍可管理。"}/><Space wrap><Button type="primary" loading={pending} onClick={async()=>{setPending(true);setError('');try{await connect();}catch(err){setError(err instanceof Error?err.message:'连接失败');}finally{setPending(false);}}}>重新连接</Button><Button onClick={()=>profile.current?.openOverlay()}>我的资料</Button>{actor.isLabManager&&<Button onClick={()=>setSettings(true)}>实验室设置</Button>}<Button onClick={async()=>{try{await researchApi('logout');}finally{await clearIMProfile();clearResearchSession();useResearchStore.getState().clear();setError('');}}}>退出</Button></Space><LabSettings open={settings} onClose={()=>setSettings(false)}/><ResearchUserCard isSelf ref={profile}/></div> : <>
    <h1 className="mb-5 text-xl font-medium">{registering ? "邀请码注册" : "登录科研微信"}</h1>
    {registered && <Alert className="mb-3" type="success" message="账号已创建，请登录" />}
    <Form layout="vertical" onFinish={values => void login(values)} disabled={pending}>
      {registering && <><Form.Item label="实验室邀请码" name="inviteCode" rules={[{ required: true }]}><Input autoComplete="off" /></Form.Item><Form.Item label="显示姓名" name="displayName" rules={[{ required: true }]}><Input /></Form.Item></>}
      <Form.Item label="用户名" name="username" rules={[{ required: true }]}><Input autoComplete="username" /></Form.Item>
      <Form.Item label="密码" name="password" rules={[{ required: true }, { min: 9, message: "密码至少 9 个字符" }]}><Input.Password autoComplete={registering ? "new-password" : "current-password"} /></Form.Item>
      {(error || connectionError) && <Alert className="mb-3" type="error" showIcon message={error || connectionError} />}
      <Button type="primary" htmlType="submit" block loading={pending}>{registering ? "创建账号" : "登录并连接"}</Button>
      <Button type="link" className="mt-2" onClick={() => { setRegistering(!registering); setError(""); }}>{registering ? "返回登录" : "使用实验室邀请码注册"}</Button>
    </Form>
    </>}
    </>}
  </div>;
}
