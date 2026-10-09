import { create } from "zustand";

// Presentation preference only; conversation identity and SDK state stay in their stores.
export const useDesktopUI = create<{
  chatsCollapsed: boolean;
  setChatsCollapsed: (collapsed: boolean) => void;
}>((set) => ({
  chatsCollapsed: false,
  setChatsCollapsed: (chatsCollapsed) => set({ chatsCollapsed }),
}));

export const desktopTheme = {
  colorPrimary: "#1473C8",
  colorText: "#11191C",
  colorTextSecondary: "#697176",
  colorBgLayout: "#FCFCFC",
  colorBorderSecondary: "#EEEEF0",
  borderRadius: 14,
  fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
};
