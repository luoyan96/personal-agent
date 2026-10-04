import { app } from "electron";
import path from "node:path";
import { smokeResult } from "../utils/smoke";

if (process.env.OPENIM_SMOKE_TEST === "1" && process.env.OPENIM_SMOKE_RESULT_FILE) app.setPath("userData", path.dirname(process.env.OPENIM_SMOKE_RESULT_FILE));
const fail = (error: unknown) => { console.error(error); smokeResult("failed", error instanceof Error ? error.stack : String(error)); app.exit(1); };
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
// Electron 22's native ESM loader cannot resolve modules inside app.asar.
// Use the original CommonJS entry while keeping startup failures observable.
try { require("./index.js"); } catch (error) { fail(error); }
