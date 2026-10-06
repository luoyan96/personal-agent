import { getWithRenderProcess } from "@openim/electron-client-sdk/lib/render";
import { AllowType } from "@openim/wasm-client-sdk";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { contactDestination } from "@/research/contactDestination";

import { useConversationStore, useUserStore } from "@/store";
import { emit } from "@/utils/events";
import { getIMToken, getIMUserID } from "@/utils/storage";

// const isElectronProd = import.meta.env.MODE !== "development" && window.electronAPI;

const { instance } = getWithRenderProcess({
  wasmConfig: {
    coreWasmPath: "/openIM.wasm",
    sqlWasmPath: `/sql-wasm.wasm`,
  },
});
const openIMSDK = instance;

export const IMSDK = openIMSDK;

export const MainContentWrap = () => {
  const [hasStoredProfile, setHasStoredProfile] = useState(false);
  const updateAppSettings = useUserStore((state) => state.updateAppSettings);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const loginCheck = async () => {
      const IMToken = await getIMToken();
      const IMUserID = await getIMUserID();
      if (cancelled) return;
      if (!IMToken || !IMUserID) {
        setHasStoredProfile(false);
        const destination = contactDestination(location.pathname, location.search);
        navigate("/login", { replace: true, state: destination ? { contactDestination: destination } : null });
        return;
      }
      setHasStoredProfile(true);
    };

    void loginCheck();
    return () => { cancelled = true; };
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    window.userClick = (userID?: string, groupID?: string) => {
      if (!userID || userID === "AtAllTag") return;

      const currentGroupInfo = useConversationStore.getState().currentGroupInfo;

      if (groupID && currentGroupInfo?.lookMemberInfo === AllowType.NotAllowed) {
        return;
      }

      emit("OPEN_USER_CARD", {
        userID,
        groupID,
        isSelf: userID === useUserStore.getState().selfInfo.userID,
        notAdd:
          Boolean(groupID) &&
          currentGroupInfo?.applyMemberFriend === AllowType.NotAllowed,
      });
    };
  }, []);

  useEffect(() => {
    const initSettingStore = async () => {
      if (!window.electronAPI) return;
      updateAppSettings({
        closeAction:
          (await window.electronAPI?.ipcInvoke("getKeyStore", {
            key: "closeAction",
          })) || "miniSize",
      });
      void window.electronAPI?.ipcInvoke("main-win-ready");
    };

    void initSettingStore();
  }, [updateAppSettings]);

  return hasStoredProfile ? <Outlet /> : null;
};
