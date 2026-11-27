import type { MessageItem } from "@openim/wasm-client-sdk";
import { personalStickerInputPrefix } from "@research-agent-platform/contracts";

const prefix = "deepchat:sticker:v1:";
const idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isStickerId = (id: unknown): id is string =>
  typeof id === "string" && idPattern.test(id);

export const stickerFace = (id: string) => ({ index: -1, data: `${prefix}${id}` });

export const personalStickerText = (label: string) => `${personalStickerInputPrefix}${label}`;

export function readStickerId(message: Pick<MessageItem, "faceElem">) {
  const data = message.faceElem?.data;
  if (
    message.faceElem?.index !== -1 ||
    typeof data !== "string" ||
    !data.startsWith(prefix)
  )
    return;
  const id = data.slice(prefix.length);
  return isStickerId(id) ? id : undefined;
}
