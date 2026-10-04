import packageJson from "../../package.json";

export const APP_NAME = "科研微信";
export const APP_VERSION = `v${packageJson.version}`;
export const SDK_VERSION = window.electronAPI
  ? `SDK(FFI) 依赖版本 ${packageJson.dependencies["@openim/electron-client-sdk"]}`
  : `SDK(WASM) 依赖版本 ${packageJson.dependencies["@openim/wasm-client-sdk"]}`;
export const isSaveLog = process.env.NODE_ENV !== "development";
