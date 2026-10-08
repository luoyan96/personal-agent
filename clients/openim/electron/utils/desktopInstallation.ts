import { existsSync } from "node:fs";
import path from "node:path";

// The NSIS identity stays the same when ResearchWeChat is renamed to AcceptCat.
// Recognize both uninstallers so existing installations keep their update entry.
export function isInstalledWindowsApp(
  platform: string,
  packaged: boolean,
  executable: string,
): boolean {
  return (
    platform === "win32" &&
    packaged &&
    ["Uninstall AcceptCat.exe", "Uninstall ResearchWeChat.exe"].some((name) =>
      existsSync(path.join(path.dirname(executable), name)),
    )
  );
}
