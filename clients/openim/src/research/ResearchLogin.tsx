import { Alert, Button, Form, Input, Space } from "antd";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { clearIMProfile, setIMProfile } from "@/utils/storage";
import { clearResearchSession, researchApi } from "./api";
import { useResearchStore } from "./store";
import { LabSettings } from "./LabSettings";
import { ResearchUserCard } from "./ResearchUserCard";
import { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";

export default function ResearchLogin() {
  const [registering, setRegistering] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [serviceAddress, setServiceAddress] = useState("");
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const connectionError = useResearchStore((s) => s.error);
  const actor = useResearchStore((s) => s.actor);
  const imReason = useResearchStore((s) => s.session?.reason);
  const imDescription =
    imReason === "not_configured"
      ? "即时通信服务尚未配置。请联系实验室负责人；资料和实验室设置仍可使用。"
      : imReason === "policy_not_configured"
      ? "即时通信权限配置待核对。请联系实验室负责人。"
      : imReason === "backend_unreachable"
      ? "即时通信服务暂时无法连接，请稍后重新连接。"
      : "即时通信账号准备失败，请稍后重试或联系实验室负责人。";
  const [settings, setSettings] = useState(false);
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
    navigate("/chat");
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
            navigate("/chat");
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
            inviteCode: values.inviteCode!,
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
                {actor.isLabManager && (
                  <Button onClick={() => setSettings(true)}>实验室设置</Button>
                )}
                <Button
                  onClick={async () => {
                    try {
                      await researchApi("logout");
                    } finally {
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
              <ResearchUserCard isSelf ref={profile} />
            </div>
          ) : (
            <>
              <h1 className="mb-5 text-xl font-medium">
                {registering ? "邀请码注册" : "登录科研微信"}
              </h1>
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
                      label="实验室邀请码"
                      name="inviteCode"
                      rules={[{ required: true }]}
                    >
                      <Input autoComplete="off" />
                    </Form.Item>
                    <Form.Item
                      label="显示姓名"
                      name="displayName"
                      rules={[{ required: true }]}
                    >
                      <Input />
                    </Form.Item>
                  </>
                )}
                <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
                  <Input autoComplete="username" />
                </Form.Item>
                <Form.Item
                  label="密码"
                  name="password"
                  rules={[{ required: true }, { min: 9, message: "密码至少 9 个字符" }]}
                >
                  <Input.Password
                    autoComplete={registering ? "new-password" : "current-password"}
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
                <Button type="primary" htmlType="submit" block loading={pending}>
                  {registering ? "创建账号" : "登录并连接"}
                </Button>
                <Button
                  type="link"
                  className="mt-2"
                  onClick={() => {
                    setRegistering(!registering);
                    setError("");
                  }}
                >
                  {registering ? "返回登录" : "使用实验室邀请码注册"}
                </Button>
              </Form>
            </>
          )}
        </>
      )}
    </div>
  );
}
