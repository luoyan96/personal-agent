import { t } from "i18next";
import { useCallback, useState } from "react";
import { useCopyToClipboard } from "react-use";

import login_bg from "@/assets/images/login/login_bg.png";
import WindowControlBar from "@/components/WindowControlBar";
import { APP_NAME, APP_VERSION, SDK_VERSION } from "@/config";
import { feedbackToast } from "@/utils/common";
import { getLoginMethod, setLoginMethod as saveLoginMethod } from "@/utils/storage";

import styles from "./index.module.scss";
import LoginForm from "./LoginForm";
import ModifyForm from "./ModifyForm";
import RegisterForm from "./RegisterForm";
import ResearchLogin from "@/research/ResearchLogin";
import { researchMode } from "@/research/api";
import { MessageOutlined, TeamOutlined, BlockOutlined } from "@ant-design/icons";
import "@/research/auth-page.scss";

export type FormType = 0 | 1 | 2;

export const Login = () => {
  // 0login 1resetPassword 2register
  const [formType, setFormType] = useState<FormType>(0);
  const [loginMethod, setLoginMethod] = useState<"phone" | "email">(getLoginMethod());

  const [, copyToClipboard] = useCopyToClipboard();

  const updateLoginMethod = useCallback((method: "phone" | "email") => {
    setLoginMethod(method);
    saveLoginMethod(method);
  }, []);

  const handleCopy = () => {
    copyToClipboard(`${`${APP_NAME} ${APP_VERSION}`}/${SDK_VERSION}`);
    feedbackToast({ msg: t("toast.copySuccess") });
  };

  if (researchMode)
    return (
      <div className="research-auth-page">
        {window.electronAPI && (
          <div className="app-drag absolute left-0 right-0 top-0 h-10">
            <WindowControlBar />
          </div>
        )}
        <aside className="research-auth-brand">
          <div className="research-auth-brand-content">
            <div className="research-auth-symbol">
              <MessageOutlined rev={undefined} />
            </div>
            <h1>科研微信</h1>
            <p>与人和 Agent，像朋友一样聊天。</p>
            <ul>
              <li>
                <TeamOutlined rev={undefined} />
                一个账号，连接朋友与 Agent
              </li>
              <li>
                <MessageOutlined rev={undefined} />
                熟悉的聊天、文件与语音
              </li>
              <li>
                <BlockOutlined rev={undefined} />
                为自己的 Agent 选择模型
              </li>
            </ul>
          </div>
        </aside>
        <section className="research-auth-panel">
          <div className="research-auth-form">
            <ResearchLogin />
          </div>
        </section>
      </div>
    );

  return (
    <div className="relative flex h-full flex-col">
      <div className="app-drag relative h-10 bg-[var(--top-search-bar)]">
        <WindowControlBar />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <LeftBar />
        <div
          className={`${styles.login} mr-14 max-h-[calc(100vh-96px)] min-h-[450px] w-[350px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-md p-8 max-[900px]:mr-0 max-[400px]:p-5`}
          style={{ boxShadow: "0 0 30px rgba(0,0,0,.1)" }}
        >
          {researchMode ? (
            <ResearchLogin />
          ) : (
            <>
              {formType === 0 && (
                <LoginForm
                  setFormType={setFormType}
                  loginMethod={loginMethod}
                  updateLoginMethod={updateLoginMethod}
                />
              )}
              {formType === 1 && (
                <ModifyForm setFormType={setFormType} loginMethod={loginMethod} />
              )}
              {formType === 2 && (
                <RegisterForm loginMethod={loginMethod} setFormType={setFormType} />
              )}
            </>
          )}
        </div>
      </div>
      <div
        className="absolute bottom-3 right-3 flex cursor-pointer flex-col items-center text-xs"
        onClick={handleCopy}
      >
        <div className="text-[var(--sub-text)]">{`${APP_NAME} ${APP_VERSION}`}</div>
        <div className="text-[var(--sub-text)]">{SDK_VERSION}</div>
      </div>
    </div>
  );
};

const LeftBar = () => {
  return (
    <div className="flex min-h-[420] max-[900px]:hidden">
      <div className="mr-14 text-center">
        <div className="text-2xl">
          {researchMode ? "科研微信" : t("placeholder.title")}
        </div>
        <span className="text-sm text-gray-500">
          {researchMode
            ? "和真人与 AI 一起，把科研任务做完"
            : t("placeholder.subTitle")}
        </span>
        <img src={login_bg} alt="login_bg" />
      </div>
    </div>
  );
};
