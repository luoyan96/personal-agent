import { Alert, App, Button } from "antd";
import {
  ApiOutlined,
  BookOutlined,
  CloudDownloadOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { APP_NAME } from "@/config/brand";
import OIMAvatar from "@/components/OIMAvatar";
import { useUserStore } from "@/store";
import { AboutContent } from "@/layout/LeftNavBar/About";
import { PersonalSettingsContent } from "@/layout/LeftNavBar/PersonalSettings";
import { DesktopVersionPanel } from "@/layout/LeftNavBar/DesktopVersionPanel";
import { useDesktopUpdates } from "@/layout/LeftNavBar/useDesktopUpdates";
import { MyAgentsWorkspace } from "./MyAgentsWorkspace";
import { WorkbenchCapabilities } from "./CapabilitySquare";
import { ModelSettings } from "./ModelSettings";
import { PersonalMemoryPanel } from "./PersonalMemoryPanel";
import { MyProfile } from "./MyProfile";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import "./my-workspace.scss";

const sections = [
  { value: "profile", label: "个人资料", icon: UserOutlined },
  { value: "agents", label: "我的 Agent", icon: RobotOutlined },
  { value: "capabilities", label: "课题组能力", icon: TeamOutlined },
  { value: "models", label: "模型设置", icon: ApiOutlined },
  { value: "memory", label: "记忆与偏好", icon: BookOutlined },
  { value: "preferences", label: "通用设置", icon: SettingOutlined },
  { value: "version", label: "版本与帮助", icon: CloudDownloadOutlined },
];

export function MyWorkspace() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("view");
  const view =
    requested === "skills"
      ? "agents"
      : sections.some((s) => s.value === requested)
      ? requested!
      : "profile";
  const generation = useResearchStore((s) => s.generation);
  const actor = useResearchStore((s) => s.actor);
  const self = useUserStore((s) => s.selfInfo);
  const navigate = useNavigate(),
    updates = useDesktopUpdates();
  const { modal } = App.useApp();
  const confirmation = useRef<ReturnType<typeof modal.confirm>>();
  const [failure, setFailure] = useState("");
  const operation = usePersonalOperation(true, "my-workspace");
  useLayoutEffect(() => {
    setFailure("");
    return () => confirmation.current?.destroy();
  }, [generation]);
  const logout = () => {
    const { isCurrent } = operation.capture();
    confirmation.current = modal.confirm({
      title: "退出登录",
      content: "确定退出当前账号？",
      onOk: async () => {
        if (!isCurrent()) return;
        try {
          await useUserStore.getState().userLogout();
        } catch (error) {
          if (isCurrent())
            setFailure(error instanceof Error ? error.message : "退出未完成，请重试。");
        }
      },
    });
  };
  return (
    <main className="social-workspace my-workspace">
      <header className="workspace-heading">
        <div>
          <h1>我的</h1>
          <p>管理个人资料、科研助手与使用偏好。</p>
        </div>
      </header>
      <div className="my-workspace-body">
        <aside className="my-workspace-sidebar">
          <div className="my-workspace-identity">
            <OIMAvatar
              src={self.faceURL}
              text={actor?.member.displayName || self.nickname}
              size={48}
            />
            <strong>{actor?.member.displayName || self.nickname || "我的账号"}</strong>
          </div>
          <nav aria-label="我的栏目">
            {sections.map(({ value, label, icon: Icon }) => (
              <button
                type="button"
                key={value}
                aria-current={view === value ? "page" : undefined}
                onClick={() => setParams({ view: value })}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <Button type="text" className="my-workspace-logout" onClick={logout}>
            退出登录
          </Button>
        </aside>
        <section
          className={`my-workspace-content my-workspace-${view}`}
          key={`${generation}:${view}`}
          aria-label="我的内容"
        >
          {failure && <Alert type="warning" message={failure} />}
          {view === "agents" ? (
            <MyAgentsWorkspace />
          ) : view === "capabilities" ? (
            <WorkbenchCapabilities view="lab" />
          ) : view === "models" ? (
            <ModelSettings open embedded onClose={() => navigate("/me")} />
          ) : view === "memory" ? (
            <PersonalMemoryPanel active />
          ) : view === "preferences" ? (
            <section className="my-preferences">
              <header className="my-section-heading">
                <h2>通用设置</h2>
                <p>语言与桌面使用习惯。</p>
              </header>
              <PersonalSettingsContent embedded />
            </section>
          ) : view === "version" ? (
            <>
              <DesktopVersionPanel updates={updates} />
              <section className="my-about">
                <h3>关于 {APP_NAME}</h3>
                <p>面向教师、科研工作者与实验室团队的科研协作工具。</p>
                <a
                  href="https://github.com/luoyan96/personal-agent/issues"
                  target="_blank"
                  rel="noreferrer"
                >
                  反馈问题与建议
                </a>
                <details className="my-about-diagnostics">
                  <summary>版本详情与诊断</summary>
                  <AboutContent embedded />
                </details>
              </section>
            </>
          ) : (
            <MyProfile />
          )}
        </section>
      </div>
    </main>
  );
}
