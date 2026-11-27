import type { ReactNode } from "react";
import { dafeiyuStickers } from "@/assets/dafeiyu-stickers/catalog";
import { personalStickerText } from "./chat-sticker-message";
import "./chat-sticker.scss";

const stickers = new Map(dafeiyuStickers.map((sticker) => [sticker.id, sticker]));
const personalStickerIds = new Map(
  dafeiyuStickers.map((sticker) => [personalStickerText(sticker.label), sticker.id]),
);

export const getChatSticker = (id: string | undefined) =>
  id === undefined ? undefined : stickers.get(id);

// Canonical self messages keep a readable caption for clients without sticker support.
export const getPersonalStickerId = (text: string | null | undefined) =>
  typeof text === "string" ? personalStickerIds.get(text) : undefined;

export default function ChatSticker({
  stickerId,
  fallback = null,
}: {
  stickerId?: string;
  fallback?: ReactNode;
}) {
  const sticker = getChatSticker(stickerId);
  if (!sticker) return <>{fallback}</>;
  return (
    <img
      className="chat-sticker"
      src={sticker.url}
      alt={`大肥鱼娘：${sticker.label}`}
      width={128}
      height={128}
      draggable={false}
    />
  );
}
