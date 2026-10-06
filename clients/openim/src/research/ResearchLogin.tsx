import { Alert, Button, Form, Input, Space } from "antd";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { clearIMProfile, setIMProfile } from "@/utils/storage";
import { clearResearchSession, researchApi } from "./api";
import { useResearchStore } from "./store";
import { LabSettings } from "./LabSettings";
import { ResearchUserCard } from "./ResearchUserCard";
import { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { routes } from "@research-agent-platform/contracts";
import { validationMessage } from "./api-errors";
import { contactReturnState } from "./contactDestination";
import { PersonalAssistantPanel } from "./PersonalAssistantPanel";

const authRule = (field: "username" | "password" | "inviteCode") => ({
  validator: async (_rule: unknown, value: unknown) => {
    const input =
      typeof value === "string" && field !== "password" ? value.trim() : value;
    const parsed = routes.register.request.shape.body.shape[field].safeParse(
      field === "inviteCode" && !input ? undefined : input,
    );
    if (!parsed.success) throw new Error(validationMessage([{ path: [field] }]));
  },
});

export default function ResearchLogin() {
  const [registering, setRegistering] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [serviceAddress, setServiceAddress] = useState("");
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const returnDestination = useRef(contactReturnState(routeLocation.state));
  const enterApp = () => {
    const target = returnDestination.current || "/chat";
    returnDestination.current = undefined;
    navigate(target, { replace: true, state: null });
  };
  const connectionError = useResearchStore((s) => s.error);
  const actor = useResearchStore((s) => s.actor);
  const imReason = useResearchStore((s) => s.session?.reason);
  const imDescription =
    imReason === "not_configured"
      ? "即时通信服务尚未配置。请联系服务管理员；资料和模型设置仍可使用。"
      : imReason === "policy_not_configured"
      ? "即时通信权限配置待核对。请联系实验室负责人。"
      : imReason === "backend_unreachable"
      ? "即时通信服务暂时无法连接，请稍后重新连接。"
      : "即时通信账号准备失败，请稍后重试或联系实验室负责人。";
  const [settings, setSettings] = useState(false);
  const [personal, setPersonal] = useState(false);
  const profile = useRef<OverlayVisibleHandle>(null);
  const connect = async () => {
    const generation = useResearchStore.getState().generation;
    const actor = (await researchApi("session")).data;
    const session = (
      await researchApi("imSession", {
        body: { platformID: window.electronAPI ? 3 : 5 },
      })
    ).data;
    if (generation !== useResearchStore.getState().generation) return;
    useResearchStore.getState().setSession(session, actor);
    const authenticatedGeneration = useResearchStore.getState().generation;
    await useResearchStore.getState().refresh();
    if (authenticatedGeneration !== useResearchStore.getState().generation) return;
    if (session.status !== "available" || !session.user || !session.configuration)
      return;
    await setIMProfile({
      chatToken: "",
      imToken: session.user.imToken,
      userID: session.user.userID,
    });
    enterApp();
  };
  useEffect(() => {
    if (location.protocol === "file:") {
      void window.electronAPI
        ?.getResearchServiceStatus()
        .then((status) => {
          setServiceAddress(status.address);
          setError(status.error);
        })
        .catch((err) => setError(String(err)));
      return;
    }
    const expired = () => {
      useResearchStore.getState().clear();
      returnDestination.current = undefined;
      setSettings(false);
      profile.current?.closeOverlay();
    };
    window.addEventListener("research-session-expired", expired);
    // A failed SDK attempt returns here with the authenticated RAP actor intact.
    // Wait for an explicit reconnect instead of exchanging another token on
    // every mount and repeatedly kicking the previous socket offline.
    if (routeLocation.state?.imConnectionFailed)
      return () => window.removeEventListener("research-session-expired", expired);
    const generation = useResearchStore.getState().generation;
    void researchApi("session")
      .then(async (result) => {
        const session = (
          await researchApi("imSession", {
            body: { platformID: window.electronAPI ? 3 : 5 },
          })
        ).data;
        if (generation !== useResearchStore.getState().generation) return;
        useResearchStore.getState().setSession(session, result.data);
        const authenticatedGeneration = useResearchStore.getState().generation;
        await useResearchStore.getState().refresh();
        if (authenticatedGeneration !== useResearchStore.getState().generation) return;
        if (session.status === "available" && session.user && session.configuration) {
          await setIMProfile({
            chatToken: "",
            imToken: session.user.imToken,
            userID: session.user.userID,
          });
          if (authenticatedGeneration === useResearchStore.getState().generation)
            enterApp();
        }
      })
      .catch(() => {});
    return () => window.removeEventListener("research-session-expired", expired);
  }, []);
  const login = async (values: {
    username: string;
    password: string;
    inviteCode?: string;
    displayName?: string;
  }) => {
    setPending(true);
    setError("");
    try {
      if (registering) {
        await researchApi("register", {
          body: {
            username: values.username,
            password: values.password,
            ...(values.inviteCode?.trim()
              ? { inviteCode: values.inviteCode.trim() }
              : {}),
            displayName: values.displayName!,
          },
        });
        setRegistering(false);
        setRegistered(true);
        return;
      }
      await researchApi("login", {
        body: { username: values.username, password: values.password },
      });
      await connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请检查服务连接");
    } finally {
      setPending(false);
    }
  };
  return (
    <div>
      {location.protocol === "file:" ? (
        <>
          <h1 className="mb-3 text-xl">连接科研微信</h1>
          <Alert
            type="info"
            showIcon
            message="选择实验室的科研服务"
            description="填写实验室提供的可信 HTTPS 地址，保存后进入该服务的登录页面。本机开发可填写 http://127.0.0.1:4317。"
          />
          <label className="mt-4 block">
            科研微信服务地址
            <Input
              className="mt-2"
              value={serviceAddress}
              onChange={(e) => setServiceAddress(e.target.value)}
              placeholder="https://你的实验室域名"
              autoComplete="url"
            />
          </label>
          {error && <Alert className="my-3" type="error" message={error} />}
          <Button
            type="primary"
            block
            className="mt-4"
            loading={pending}
            disabled={!serviceAddress.trim()}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await window.electronAPI?.configureResearchService(serviceAddress);
              } catch (err) {
                setError(err instanceof Error ? err.message : "连接失败");
              } finally {
                setPending(false);
              }
            }}
          >
            保存并连接
          </Button>
        </>
      ) : (
        <>
          {actor ? (
            <div className="space-y-3">
              <h1 className="text-xl">科研账号已登录</h1>
              <p>{actor.member.displayName}</p>
              <Alert
                type="warning"
                showIcon
                message="即时通信未连接"
                description={error || connectionError || imDescription}
              />
              {imReason && (
                <details className="text-xs text-slate-500">
                  <summary>连接详情</summary>
                  {imReason}
                </details>
              )}
              <Space wrap>
                <Button
                  type="primary"
                  loading={pending}
                  onClick={async () => {
                    setPending(true);
                    setError("");
                    try {
                      await connect();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "连接失败");
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  重新连接
                </Button>
                <Button onClick={() => profile.current?.openOverlay()}>我的资料</Button>
                <Button onClick={() => setSettings(true)}>模型设置</Button>
                <Button onClick={() => setPersonal(true)}>记忆与跟进</Button>
                <Button
                  onClick={async () => {
                    try {
                      await researchApi("logout");
                    } finally {
                      returnDestination.current = undefined;
                      await clearIMProfile();
                      clearResearchSession();
                      useResearchStore.getState().clear();
                      setError("");
                    }
                  }}
                >
                  退出
                </Button>
              </Space>
              <LabSettings open={settings} onClose={() => setSettings(false)} />
              <PersonalAssistantPanel open={personal} onClose={() => setPersonal(false)} />
              <ResearchUserCard isSelf ref={profile} />
            </div>
          ) : (
            <>
              <h1>{registering ? "创建账号" : "登录科研微信"}</h1>
              <p className="research-auth-subtitle">
                {registering
                  ? "注册后即可添加好友，与 Agent 聊天。"
                  : "与朋友和你的 Agent 继续聊天。"}
              </p>
              {registered && (
                <Alert className="mb-3" type="success" message="账号已创建，请登录" />
              )}
              <Form
                layout="vertical"
                onFinish={(values) => void login(values)}
                disabled={pending}
              >
                {registering && (
                  <>
                    <Form.Item
                      label="显示姓名"
                      name="displayName"
                      rules={[
                        { required: true, message: "请输入显示姓名" },
                        { max: 200, message: "显示姓名最多 200 个字符" },
                      ]}
                    >
                      <Input placeholder="请输入你的显示姓名" autoComplete="name" />
                    </Form.Item>
                  </>
                )}
                <Form.Item
                  label="用户名"
                  name="username"
                  rules={[authRule("username")]}
                  extra="用于登录和添加好友；区分大小写。"
                >
                  <Input
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="请输入用户名"
                  />
                </Form.Item>
                <Form.Item
                  label="密码"
                  name="password"
                  rules={[authRule("password")]}
                  extra="至少 8 个字符"
                >
                  <Input.Password
                    autoComplete={registering ? "new-password" : "current-password"}
                    placeholder="请输入密码"
                  />
                </Form.Item>
                {(error || connectionError) && (
                  <Alert
                    className="mb-3"
                    type="error"
                    showIcon
                    message={error || connectionError}
                  />
                )}
                <Button
                  className="research-auth-submit"
                  type="primary"
                  htmlType="submit"
                  block
                  loading={pending}
                >
                  {registering ? "创建账号" : "登录并连接"}
                </Button>
                <div className="research-auth-switch">
                  {registering ? "已有账号？" : "还没有账号？"}
                  <Button
                    type="link"
                    className="mt-2"
                    onClick={() => {
                      setRegistering(!registering);
                      setError("");
                    }}
                  >
                    {registering ? "登录" : "创建账号"}
                  </Button>
                </div>
                {registering && (
                  <details className="research-auth-team">
                    <summary>我有团队邀请码（可选）</summary>
                    <Form.Item
                      label="团队邀请码"
                      name="inviteCode"
                      rules={[authRule("inviteCode")]}
                    >
                      <Input autoComplete="off" placeholder="加入已有团队时填写" />
                    </Form.Item>
                  </details>
                )}
              </Form>
            </>
          )}
        </>
      )}
    </div>
  );
}
