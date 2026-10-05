import { Alert, Button, Layout } from "antd";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import empty_chat_bg from "@/assets/images/empty_chat_bg.png";
import { emit } from "@/utils/events";
import { researchMode } from "@/research/api";
import type { ResearchChatEntry } from "@/research/useResearchChatEntry";

export const EmptyChat = () => {
  const { t } = useTranslation();
  const entry = useOutletContext<ResearchChatEntry>();
  const createNow = () => {
    emit("OPEN_CHOOSE_MODAL", {
      type: "CRATE_GROUP",
    });
  };

  if (researchMode)
    return (
      <Layout className="no-mobile flex items-center justify-center bg-white px-6">
        <div className="max-w-sm space-y-4">
          <h1 className="text-xl font-medium">准备聊天</h1>
          <p className="text-slate-600">
            与你的 Agent 聊聊科研、学习或日常想法，也可以从左侧选择朋友。
          </p>
          {entry.error ? (
            <Alert type="error" showIcon message={entry.error} />
          ) : (
            <p className="text-sm text-slate-500" role="status">
              {!entry.ready
                ? "正在登录并同步即时通信，完成后将打开你的 Agent…"
                : entry.pending || !entry.canOpenCoordinator
                ? "正在准备当前账号的聊天…"
                : "也可以从左侧选择已有聊天。"}
            </p>
          )}
          <Button
            type="primary"
            loading={entry.pending}
            disabled={!entry.ready}
            onClick={entry.retry}
          >
            {entry.canOpenCoordinator ? "打开我的 Agent" : "重试准备聊天"}
          </Button>
        </div>
      </Layout>
    );
  return (
    <Layout className="no-mobile flex items-center justify-center bg-white">
      <div>
        <div className="mb-12 flex flex-col items-center">
          <div className="mb-3 text-xl font-medium">{t("placeholder.createGroup")}</div>
          <div className="text-[var(--sub-text)]">
            {t("placeholder.createGroupToast")}
          </div>
        </div>
        <img src={empty_chat_bg} alt="" width={320} />

        <div className="mt-28 flex justify-center">
          <Button className="px-8" type="primary" onClick={createNow}>
            {t("placeholder.createNow")}
          </Button>
        </div>
      </div>
    </Layout>
  );
};
