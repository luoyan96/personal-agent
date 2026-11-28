import { net, type IpcMainInvokeEvent } from "electron";
import { createHash } from "node:crypto";

import { desktopSessionCookie } from "../utils/desktopServer";
import { authority } from "./localFolderManage";
import { getResearchServiceStatus } from "./windowManage";

export type DesktopCredentials = {
  owner: string;
  service: string;
  token: string;
  session: Electron.Session;
};

/** Stable across reauthentication, scoped to the service that issued the member ID. */
export const desktopAccountIdentity = (service: string, memberId: string) =>
  createHash("sha256").update(JSON.stringify([service, memberId])).digest("hex");

export async function desktopCredentials(
  event: IpcMainInvokeEvent,
): Promise<DesktopCredentials | null> {
  const auth = authority(event);
  const service = new URL(getResearchServiceStatus().address).origin;
  const origin = new URL(auth.contents.getURL()).origin;
  const name = origin === service ? "rap_session" : desktopSessionCookie(service);
  const token = (
    await auth.contents.session.cookies.get({ url: origin, name })
  ).find((cookie) => cookie.name === name && cookie.httpOnly)?.value;
  if (!token || !/^[A-Za-z0-9_-]{16,256}$/.test(token)) return null;
  if (
    authority(event).owner !== auth.owner ||
    new URL(getResearchServiceStatus().address).origin !== service
  ) return null;
  return { owner: auth.owner, service, token, session: auth.contents.session };
}

/** The service associates a member ID with the desktop's current HttpOnly cookie. */
export function desktopSessionMemberId(current: DesktopCredentials) {
  return new Promise<string>((resolve, reject) => {
    const request = net.request({
      url: current.service + "/api/v1/auth/session",
      session: current.session,
      useSessionCookies: false,
      redirect: "error",
    });
    request.setHeader("Cookie", "rap_session=" + current.token);
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error("账号核对超时。"));
    }, 10000);
    const fail = () => {
      clearTimeout(timer);
      reject(new Error("无法核对 DeepChat 账号。"));
    };
    request.on("error", fail);
    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("error", fail);
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 1048576) {
          request.abort();
          fail();
        } else chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => {
        clearTimeout(timer);
        try {
          const memberId = JSON.parse(Buffer.concat(chunks).toString("utf8")).data
            ?.member?.id;
          if (response.statusCode !== 200 || typeof memberId !== "string" || !memberId)
            throw new Error();
          resolve(memberId);
        } catch {
          reject(new Error("登录已失效，请重新登录 DeepChat。"));
        }
      });
    });
    request.end();
  });
}
