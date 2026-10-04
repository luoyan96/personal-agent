import { writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
let failed = false;
export function smokeProgress(stage: string) {
  if (process.env.OPENIM_SMOKE_TEST !== "1" || failed) return;
  const output = process.env.OPENIM_SMOKE_RESULT_FILE;
  if (
    output &&
    path.dirname(path.dirname(path.resolve(output))) === path.resolve(os.tmpdir()) &&
    path.basename(path.dirname(output)).startsWith("openim-electron-smoke-") &&
    path.basename(output) === "startup-result.json"
  )
    writeFileSync(
      output,
      JSON.stringify({ phase: "loading", stage, at: new Date().toISOString() }),
    );
}
export function smokeResult(phase: "ready" | "failed", error?: string) {
  if (process.env.OPENIM_SMOKE_TEST !== "1") return;
  if (failed && phase === "ready") return;
  if (phase === "failed") failed = true;
  const output = process.env.OPENIM_SMOKE_RESULT_FILE;
  if (output) {
    const directory = path.dirname(path.resolve(output));
    if (
      path.dirname(directory) !== path.resolve(os.tmpdir()) ||
      !path.basename(directory).startsWith("openim-electron-smoke-") ||
      path.basename(output) !== "startup-result.json"
    )
      throw new Error("Unexpected smoke result location");
    writeFileSync(
      output,
      JSON.stringify({ phase, error: error || null, at: new Date().toISOString() }),
    );
  }
  (phase === "ready" ? process.stdout : process.stderr).write(
    phase === "ready" ? "OPENIM_ELECTRON_READY\n" : `OPENIM_ELECTRON_FAILED ${error}\n`,
  );
}
