import { app } from "electron";
import path from "node:path";
import os from "node:os";
import { smokeResult, smokeProgress } from "../utils/smoke";

if (process.env.OPENIM_SMOKE_TEST === "1" && process.env.OPENIM_SMOKE_RESULT_FILE)
  app.setPath("userData", path.dirname(process.env.OPENIM_SMOKE_RESULT_FILE));
if (process.env.OPENIM_HIDE_WINDOW === "1" && process.env.OPENIM_TEST_USER_DATA) {
  const directory = path.resolve(process.env.OPENIM_TEST_USER_DATA);
  if (
    path.dirname(directory) !== path.resolve(os.tmpdir()) ||
    !path.basename(directory).startsWith("openim-electron-review-")
  )
    throw new Error("Unexpected desktop review directory");
  app.setPath("userData", directory);
}
const fail = (error: unknown) => {
  console.error(error);
  smokeResult("failed", error instanceof Error ? error.stack : String(error));
  app.exit(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
// Electron 22's native ESM loader cannot resolve modules inside app.asar.
// Use the original CommonJS entry while keeping startup failures observable.
try {
  smokeProgress("bootstrap");
  require("./index.js");
  smokeProgress("main-module-loaded");
} catch (error) {
  fail(error);
}
