#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
const explicitExecutable = process.argv.slice(2).find((arg) => arg !== "--");

const getDefaultExecutable = () => {
  const releaseRoot = path.join(repoRoot, "release", "Base", rootPackage.version);
  if (process.platform === "darwin") {
    return path.join(
      releaseRoot,
      `mac-${process.arch}`,
      "DeepChat.app",
      "Contents",
      "MacOS",
      "DeepChat",
    );
  }
  if (process.platform === "win32") {
    return path.join(releaseRoot, "win-unpacked", "DeepChat.exe");
  }
  return path.join(releaseRoot, "linux-unpacked", rootPackage.name);
};

const executablePath = path.resolve(
  repoRoot,
  explicitExecutable ?? getDefaultExecutable(),
);
if (!existsSync(executablePath)) {
  throw new Error(`Packaged Electron executable is missing: ${executablePath}`);
}

const userDataPath = mkdtempSync(path.join(os.tmpdir(), "openim-electron-smoke-"));
const resultPath = path.join(userDataPath, "startup-result.json");
const child = spawn(
  executablePath,
  [`--user-data-dir=${userDataPath}`, "--no-sandbox"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "1",
      OPENIM_SMOKE_TEST: "1",
      OPENIM_SMOKE_RESULT_FILE: resultPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
const collectOutput = (stream, destination) => {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    destination.write(text);
  });
};
collectOutput(child.stdout, process.stdout);
collectOutput(child.stderr, process.stderr);

// A newly extracted Windows build can take longer to load its native SDK and
// start Chromium. The smoke test still waits for the app's readiness receipt.
const startupTimeoutMs = process.platform === "win32" ? 45_000 : 15_000;
const untilDeadline = async (promises, milliseconds, result) => {
  let deadline;
  try {
    return await Promise.race([
      ...promises,
      new Promise((resolve) => {
        deadline = setTimeout(() => resolve(result), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
};
const exitPromise = new Promise((resolve) => {
  child.once("exit", (code, signal) => resolve({ type: "exit", code, signal }));
});
const errorPromise = new Promise((resolve) => {
  child.once("error", (error) => resolve({ type: "error", error }));
});
const progress = new Map();
let poll;
const readyPromise = new Promise((resolve) => {
  const inspect = () => {
    if (output.includes("OPENIM_ELECTRON_READY")) {
      resolve({ type: "ready" });
    }
  };
  child.stdout.on("data", inspect);
  child.stderr.on("data", inspect);
  poll = setInterval(() => {
    if (!existsSync(resultPath)) return;
    let value;
    try {
      value = JSON.parse(readFileSync(resultPath, "utf8"));
    } catch (error) {
      // The child replaces its loading receipt while polling is in progress.
      // A partial JSON write is transient; the startup deadline still bounds it.
      if (error instanceof SyntaxError || error.code === "ENOENT") return;
      clearInterval(poll);
      output += String(error);
      resolve({ type: "failed" });
      return;
    }
    if (value.phase === "loading") {
      progress.set(value.stage, value.at);
      return;
    }
    clearInterval(poll);
    if (value.phase === "ready") resolve({ type: "ready" });
    else {
      output += value.error;
      resolve({ type: "failed" });
    }
  }, 100);
});

const stopChild = async () => {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await untilDeadline([exitPromise], 3000);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await untilDeadline([exitPromise], 3000);
  }
};

try {
  const startupResult = await untilDeadline(
    [readyPromise, exitPromise, errorPromise],
    startupTimeoutMs,
    { type: "timeout" },
  );
  if (startupResult.type !== "ready") {
    const stages = Array.from(progress, ([stage, at]) => `${at} ${stage}`);
    throw new Error(
      `Packaged Electron app failed startup smoke test (${startupResult.type})\n${
        existsSync(resultPath)
          ? readFileSync(resultPath, "utf8")
          : "No bootstrap receipt"
      }\n${stages.join("\n")}\n${output}`,
    );
  }

  const stabilizationResult = await untilDeadline([exitPromise, errorPromise], 2000, {
    type: "stable",
  });
  if (stabilizationResult.type !== "stable") {
    throw new Error(
      `Packaged Electron app exited during startup (${stabilizationResult.type})\n${output}`,
    );
  }
  if (
    /Uncaught Exception|Cannot find module|A JavaScript error occurred|OPENIM_ELECTRON_FAILED|RENDERER_ERROR/i.test(
      output,
    )
  ) {
    throw new Error(`Packaged Electron app reported a startup error\n${output}`);
  }
  if (
    existsSync(resultPath) &&
    JSON.parse(readFileSync(resultPath, "utf8")).phase !== "ready"
  )
    throw new Error(
      `Renderer/native bridge failed: ${readFileSync(resultPath, "utf8")}`,
    );
  console.log("Packaged Electron startup smoke test passed");
} finally {
  clearInterval(poll);
  await stopChild();
  if (
    path.dirname(path.resolve(userDataPath)) !== path.resolve(os.tmpdir()) ||
    !path.basename(userDataPath).startsWith("openim-electron-smoke-")
  )
    throw new Error("Refusing to remove an unexpected smoke directory");
  rmSync(userDataPath, { recursive: true, force: true });
}
