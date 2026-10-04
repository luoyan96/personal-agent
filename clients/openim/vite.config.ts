import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-electron-plugin";
import { customStart, loadViteEnv } from "vite-electron-plugin/plugin";
import pkg from "./package.json";
import legacy from "@vitejs/plugin-legacy";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// import visualizer from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const clientRoot = path.resolve(__dirname);
  const electronOutput = path.resolve(clientRoot, "dist-electron");
  if (path.dirname(electronOutput) !== clientRoot)
    throw new Error("Electron output must remain inside the client directory");
  rmSync(electronOutput, { recursive: true, force: true });

  const sourcemap = command === "serve" || !!process.env.VSCODE_DEBUG;

  return {
    resolve: {
      alias: {
        "@": path.join(__dirname, "src"),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ["legacy-js-api"],
        },
      },
    },
    plugins: [
      react(),
      electron({
        include: ["electron"],
        transformOptions: {
          sourcemap,
        },
        plugins: [
          ...(!!process.env.VSCODE_DEBUG
            ? [
                // Will start Electron via VSCode Debug
                customStart(() =>
                  console.log(
                    /* For `.vscode/.debug.script.mjs` */ "[startup] Electron App",
                  ),
                ),
              ]
            : []),
          // Allow use `import.meta.env.VITE_SOME_KEY` in Electron-Main
          loadViteEnv(),
        ],
      }),
      // legacy({
      //   targets: ["defaults", "not IE 11"],
      // }),
      // visualizer({ open: true }),
    ],
    server: {
      host: "127.0.0.1",
      port: 4317,
      strictPort: true,
      watch: { ignored: ["**/release/**", "**/.electron-runtime/**"] },
      proxy: { "/api": { target: env.VITE_RESEARCH_PROXY || "http://127.0.0.1:3217" } },
    },
    clearScreen: false,
    build: {
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 500,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      rollupOptions: {
        output: {},
      },
    },
  };
});
