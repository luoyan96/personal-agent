import packageJson from "../../package.json";

export const APP_NAME = "科研微信";
export const APP_VERSION = `v${packageJson.version}`;
export const SDK_VERSION = `SDK(ffi) v${packageJson.dependencies["@openim/electron-client-sdk"]}`;
export const isSaveLog = process.env.NODE_ENV !== "development";
