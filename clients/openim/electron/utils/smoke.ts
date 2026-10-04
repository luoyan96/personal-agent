import { writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
export function smokeResult(phase: "ready" | "failed", error?: string) {
  if (process.env.OPENIM_SMOKE_TEST !== "1") return;
  const output = process.env.OPENIM_SMOKE_RESULT_FILE;
  if (output) {
    const directory = path.dirname(path.resolve(output));
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("openim-electron-smoke-") || path.basename(output) !== "startup-result.json") throw new Error("Unexpected smoke result location");
    writeFileSync(output, JSON.stringify({phase,error:error||null,at:new Date().toISOString()}));
  }
  (phase === "ready" ? process.stdout : process.stderr).write(phase === "ready" ? "OPENIM_ELECTRON_READY\n" : `OPENIM_ELECTRON_FAILED ${error}\n`);
}
