import { useMount } from "ahooks";
import { Layout, Spin } from "antd";
import { t } from "i18next";
import { Outlet, useMatches, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { useUserStore } from "@/store";

import LeftNavBar from "./LeftNavBar";
import TopSearchBar from "./TopSearchBar";
import { useGlobalEvent } from "./useGlobalEvents";
import { researchMode } from "@/research/api";
import { MobileNavigation } from "@/research/MobileNavigation";
import "./desktop-layout.scss";
import "./desktop-workspace.scss";

export const MainContentLayout = () => {
  useGlobalEvent();
  const matches = useMatches();
  const navigate = useNavigate();

  const progress = useUserStore((state) => state.progress);
  const syncState = useUserStore((state) => state.syncState);
  const reinstall = useUserStore((state) => state.reinstall);
  const isLogining = useUserStore((state) => state.isLogining);
  useEffect(() => {
    if (!window.electronAPI) return;
    document.body.classList.add("personal-agent-native");
    return () => document.body.classList.remove("personal-agent-native");
  }, []);

  useMount(() => {
    const isRoot = !matches.find((item) => item.pathname !== "/");
    const inConversation = matches.some((item) => item.params.conversationID);
    if (isRoot || (!researchMode && inConversation)) {
      navigate("chat", {
        replace: true,
      });
    }
  });

  const loadingTip = isLogining ? t("toast.loading") : `${progress}%`;
  const showLockLoading = isLogining || (reinstall && syncState === "loading");

  return (
    <Spin className="!max-h-none" spinning={showLockLoading} tip={loadingTip}>
      <Layout className={`h-full ${window.electronAPI ? "personal-agent-desktop" : ""}`}>
        <TopSearchBar />
        {researchMode && <MobileNavigation />}
        <Layout>
          <LeftNavBar />
          <Outlet />
        </Layout>
      </Layout>
    </Spin>
  );
};
