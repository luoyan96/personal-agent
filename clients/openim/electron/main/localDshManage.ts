import { app, BrowserView, BrowserWindow, dialog, ipcMain, nativeImage, session, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authority } from "./localFolderManage";
import { dshAccount, createDshRelay } from "./localDshAccount";
import { registerDshWorkbenchMaterialBridge } from "./dshWorkbenchMaterials";
import { registerTaskDshBridge } from './taskDshManage';
import type { DshBounds } from "../../src/types/localDsh";
import type { WorkbenchUseTarget } from "../../src/types/dshWorkbenchMaterials";
import { ensureResearchPlugin, ensureTaskContextPlugin, researchPlugin } from "../utils/dshPlugin";
// Built independently by vite.config.ts; the packaged module has no repository-relative imports.
const { LocalDshRuntime, prepareAccountProfile, dshBrowserCompatibility } = require("./localDshRuntime") as typeof import("../../../../integrations/deepseek-harness/desktop/local-runtime");
const materialPanels: Record<WorkbenchUseTarget, string> = {
  "group-meeting": "research-slides",
  "existing-document": "research-documents",
  "existing-paper": "research-literature",
};

export function registerLocalDshBridge() {
  let view: BrowserView | undefined, owner: BrowserWindow | undefined;
  let viewHost: { event: Electron.IpcMainInvokeEvent; origin: string } | undefined;
  let pageReady = false, pageError = "", starting: Promise<void> | undefined;
  let quitting = false, observed: Electron.WebContents | undefined;
  const avatar = nativeImage.createFromPath(path.join(global.pathConfig.publicPath, 'icons', 'icon.png'))
    .resize({ width: 96 }).toDataURL();
  const directory = app.isPackaged ? path.join(process.resourcesPath, 'dsh') : path.resolve(app.getAppPath(), '.dsh-runtime');
  let runtime = new LocalDshRuntime(directory, '');
  let relay: Awaited<ReturnType<typeof createDshRelay>> | undefined;
  let account: Awaited<ReturnType<typeof dshAccount>> | undefined;
  let materialPanel: { name: string; expiresAt: number } | undefined;
  let generation = 0;
  let taskHooks:ReturnType<typeof registerTaskDshBridge>;
  const accountWatch = setInterval(() => { if (account) void account.valid().catch(() => stop().catch(() => {})); }, 2000);
  accountWatch.unref();
  const snapshot = () => ({ ...runtime.state, ...(pageError ? { error: pageError } : {}), pageReady,
    accountId: account?.metadata.memberId, model: account?.metadata.model, bundled: true });
  const hide = () => { if (view && owner && !owner.isDestroyed()) owner.removeBrowserView(view); };
  function disposeView() {
    hide();
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    view = undefined;
    viewHost = undefined;
    pageReady = false;
    materialPanel = undefined;
  }
  const isPage = (url: string) => { try { return new URL(url).hash.split("?")[0] === "#/dsh"; } catch { return false; } };
  function authorize(event: Electron.IpcMainInvokeEvent, requirePage = true) {
    const auth = authority(event);
    if (requirePage && !isPage(auth.contents.getURL())) throw Error("请在 DSH 页面操作。");
    const window = BrowserWindow.fromWebContents(auth.contents);
    if (!window) throw Error("应用窗口已关闭。");
    owner = window;
    if (observed !== auth.contents) {
      observed = auth.contents;
      auth.contents.on("did-navigate-in-page", (_e, url, main) => {
        if (!main) return;
        if (!isPage(url)) hide();
        if (new URL(url).hash.startsWith("#/login")) void stop().catch(() => {});
      });
      auth.contents.on("did-start-navigation", (_e, _url, inPlace, main) => {
        if (main && !inPlace) void stop().catch(() => {});
      });
      auth.contents.on("destroyed", () => { void stop().catch(() => {}); });
      auth.contents.on("render-process-gone", () => { void stop().catch(() => {}); });
    }
    return auth;
  }
  async function stop() {
    generation++;
    disposeView();
    pageError = "";
    await relay?.close(); relay = undefined; account = undefined;
    await runtime.stop();
    await starting?.catch(() => {});
  }
  function openExternal(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
        void shell.openExternal(parsed.href);
    } catch { /* Ignore non-web schemes. */ }
  }
  async function start(event: Electron.IpcMainInvokeEvent) {
    if (starting) return starting;
    const auth = authorize(event, false), epoch = generation;
    starting = (async () => {
      pageError = "";
      const next = await dshAccount(event);
      if (epoch !== generation) return;
      if (!next.metadata.enabled) throw Error('请先在 DeepChat「我的 → 模型设置」启用并选择默认模型，然后点击重试。');
      if (!account || account.identity !== next.identity || account.lease !== next.lease || account.metadata.fingerprint !== next.metadata.fingerprint || runtime.state.phase !== 'running') {
        disposeView(); await relay?.close(); relay = undefined; account = undefined;
        await runtime.stop();
        if (epoch !== generation) return;
        const connection = await createDshRelay(next,{
          taskContext:sessionId=>taskHooks.taskContext(sessionId),
          taskFeedback:value=>taskHooks.taskFeedback(value),
        });
        if (epoch !== generation) { await connection.close(); return; }
        relay = connection; account = next;
        const home = path.join(app.getPath('userData'), 'local-dsh', 'accounts', next.identity);
        const patch = await prepareAccountProfile(home, { ...next.metadata, baseURL: connection.baseURL }, avatar);
        if (epoch !== generation) return;
        runtime = new LocalDshRuntime(directory, home,
          () => { if (runtime.state.phase !== 'running') disposeView(); }, { patch, token: connection.secret });
      }
      // The research plugin ships inside the installer. DSH installs it through its
      // own pnpm so the profile and its lockfile stay DSH's; a fresh profile only
      // appears after the first start, so that case is retried and reloaded once.
      const tarball = path.join(path.resolve(directory, ".."), "tools", "plugins", `${researchPlugin.name}-${researchPlugin.version}.tgz`);
      const ensure = async () => {
        const research=await ensureResearchPlugin({ runtime: directory, home: runtime.state.home, tarball });
        const context=await ensureTaskContextPlugin({runtime:directory,home:runtime.state.home});
        return {changed:research.changed||context.changed,reason:research.reason||context.reason};
      };
      // Never replace dependencies beneath a live plugin/Office job. A fresh
      // installation is reconciled before start; existing running DSH is reused.
      const first = runtime.state.phase === "running" ? { changed: false, reason: undefined } : await ensure();
      let url = await runtime.start();
      if (first.reason === "profile 尚未创建") {
        await runtime.stop();
        await ensure();
        await prepareAccountProfile(runtime.state.home,{...next.metadata,baseURL:relay!.baseURL}, avatar);
        url = await runtime.start();
      }
      // Do not mount a late startup over another conversation or a replaced document.
      if (epoch !== generation || authority(event).contents !== auth.contents || runtime.state.phase !== "running") return;
      await next.valid();
      if (view && !view.webContents.isDestroyed()) {
        if (!pageReady) {
          const current = view;
          await current.webContents.loadURL(url);
          if (epoch === generation && view === current && runtime.state.phase === 'running') pageReady = true;
        }
        return;
      }
      const isolated = session.fromPartition(`acceptcat-dsh-${randomUUID()}`);
      isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      isolated.setPermissionCheckHandler(() => false);
      const current = new BrowserView({ webPreferences: {
        session: isolated, nodeIntegration: false, contextIsolation: true,
        sandbox: true, webSecurity: true, spellcheck: false,
        preload: path.join(__dirname, '../preload/localDsh.js'),
      } });
      view = current;
      const origin = new URL(url).origin;
      viewHost = { event, origin };
      current.webContents.setWindowOpenHandler(({ url: target }) => {
        openExternal(target);
        return { action: "deny" };
      });
      current.webContents.on("will-navigate", (e, target) => {
        if (new URL(target).origin !== origin) { e.preventDefault(); openExternal(target); }
      });
      current.webContents.on("will-redirect", (e, target) => {
        if (new URL(target).origin !== origin) e.preventDefault();
      });
      current.webContents.on("render-process-gone", () => {
        pageError = "DSH 页面意外退出，请点击重新连接。";
        disposeView();
      });
      current.webContents.on("did-fail-load", (_e, code, _description, _url, main) => {
        if (main && code !== -3) { pageReady = false; hide(); pageError = "DSH 页面加载失败，请点击重新连接。"; }
      });
      try {
        await current.webContents.loadURL("about:blank");
        current.webContents.debugger.attach("1.3");
        await current.webContents.debugger.sendCommand("Page.enable");
        await current.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: dshBrowserCompatibility });
        await current.webContents.loadURL(url);
        if (view === current && runtime.state.phase === "running") pageReady = true;
      } catch {
        if (view === current) { disposeView(); pageError = "DSH 页面加载失败，请点击重新连接。"; }
      }
    })().catch(async (error) => {
      disposeView(); await relay?.close(); relay = undefined; account = undefined;
      await runtime.stop();
      pageError = error instanceof Error ? error.message : '本地 DSH 连接失败，请重试。';
    }).finally(() => { starting = undefined; });
    return starting;
  }
  ipcMain.handle("local-dsh-status", (event) => { authorize(event); return snapshot(); });
  const materialBridge = registerDshWorkbenchMaterialBridge(async (event) => {
    const current = view, currentAccount = account, currentHost = viewHost, epoch = generation;
    if (!current || !currentAccount || !currentHost) throw Error("工作台尚未连接。");
    const contents = current.webContents;
    const assertView = () => {
      if (current !== view || currentAccount !== account || currentHost !== viewHost || epoch !== generation ||
          runtime.state.phase !== "running" || !pageReady || contents.isDestroyed() ||
          event.sender !== contents || event.senderFrame !== contents.mainFrame ||
          new URL(event.senderFrame.url).origin !== currentHost.origin ||
          !isPage(currentHost.event.sender.getURL()))
        throw Error("工作台连接已变化，请重新打开资料选择。");
    };
    const valid = async () => {
      assertView();
      await currentAccount.valid();
      assertView();
    };
    await valid();
    return { account: currentAccount, hostEvent: currentHost.event, contents, valid };
  });
  async function materialNavigation(contents: Electron.WebContents, panel: string, open: boolean) {
    const ready = await contents.executeJavaScript(`new Promise(resolve => {
      const nonce = ${JSON.stringify(randomUUID())};
      const finish = ok => {
        clearInterval(retry); clearTimeout(deadline);
        window.removeEventListener('deepchat-material-panel-ready', accepted);
        resolve(ok);
      };
      const accepted = event => { if (event.detail === nonce) finish(true); };
      const check = () => window.dispatchEvent(new CustomEvent('deepchat-prepare-material-panel', {
        detail: { nonce, panel: ${JSON.stringify(panel)}, open: ${open} },
      }));
      window.addEventListener('deepchat-material-panel-ready', accepted);
      const deadline = setTimeout(() => finish(false), 3200);
      const retry = setInterval(check, 160);
      check();
    })`);
    if (ready !== true) throw Error("当前科研插件尚不支持从资料打开项目，请在工作台的「插件」中更新后重试。");
  }
  ipcMain.handle("local-dsh-stage-material-use-in", async (event, target: unknown, selection: unknown) => {
    const { contents: host } = authorize(event, false);
    const source = host.getURL();
    if (new URL(source).hash.split("?")[0] !== "#/library" || typeof target !== "string" ||
        !Object.prototype.hasOwnProperty.call(materialPanels, target)) throw Error("请从资料页选择所需文件。");
    const destination = target as WorkbenchUseTarget;
    await start(event);
    const current = view, currentAccount = account, currentHost = viewHost, epoch = generation;
    if (!current || !currentAccount || !currentHost || !pageReady) throw Error(pageError || "工作台尚未连接。");
    const contents = current.webContents;
    const checkSource = () => {
      if (current !== view || currentAccount !== account || epoch !== generation || runtime.state.phase !== "running" ||
          contents.isDestroyed() || new URL(contents.getURL()).origin !== currentHost.origin ||
          authority(event).contents !== host || host.getURL() !== source)
        throw Error("工作台连接或资料页已变化，请重新选择。");
    };
    const valid = async () => {
      checkSource();
      await currentAccount.valid();
      checkSource();
    };
    await valid();
    const panel = materialPanels[destination];
    await materialNavigation(contents, panel, false);
    await materialBridge.stageUseIn({ account: currentAccount, hostEvent: event, contents, valid }, destination, selection);
    materialPanel = { name: panel, expiresAt: Date.now() + 15 * 60 * 1000 };
  });
  ipcMain.handle('local-dsh-pick-directory', async (event) => {
    const current = view, currentAccount = account, epoch = generation;
    const validate = async () => {
      if (!current || current !== view || event.sender !== current.webContents
        || event.senderFrame !== current.webContents.mainFrame || !pageReady
        || !currentAccount || currentAccount !== account || epoch !== generation
        || runtime.state.phase !== 'running' || new URL(event.senderFrame.url).origin !== new URL(current.webContents.getURL()).origin)
        throw Error('工作台连接已变化，请重新选择工作目录。');
      await currentAccount.valid();
      if (current !== view || currentAccount !== account || epoch !== generation)
        throw Error('工作台连接已变化，请重新选择工作目录。');
    };
    await validate();
    if (!owner || owner.isDestroyed()) throw Error('应用窗口已关闭。');
    const result = await dialog.showOpenDialog(owner, { title: '选择工作文件夹', properties: ['openDirectory', 'createDirectory'] });
    await validate();
    return result.canceled ? undefined : result.filePaths[0];
  });
  taskHooks=registerTaskDshBridge(async (event) => {
    authorize(event, false);
    if (!account || !view || !pageReady || runtime.state.phase !== 'running') await start(event);
    if (!account || !view || !pageReady || runtime.state.phase !== 'running') throw Error(pageError || '本地 DSH 尚未就绪。');
    await account.valid();
    return { account, session: view.webContents.session, origin: new URL(view.webContents.getURL()).origin };
  },async(sessionId)=>{
    const current=view,epoch=generation;
    if(!current||!pageReady||!account)throw Error('工作台尚未连接。');
    await account.valid();
    const selected=await current.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const sessionId=${JSON.stringify(sessionId)},nonce=${JSON.stringify(randomUUID())};
      const opened=event=>{if(event.detail?.nonce!==nonce)return;cleanup();event.detail.error?reject(Error(event.detail.error)):resolve(event.detail.sessionId);};
      const send=()=>window.dispatchEvent(new CustomEvent('acceptcat-open-task',{detail:{sessionId,nonce}}));
      const cleanup=()=>{clearTimeout(deadline);clearInterval(retry);window.removeEventListener('acceptcat-task-opened',opened);};
      window.addEventListener('acceptcat-task-opened',opened);
      const deadline=setTimeout(()=>{cleanup();reject(Error('工作台任务会话未能打开，请重试连接。'));},10000);
      const retry=setInterval(send,500);send();
    })`);
    if(current!==view||epoch!==generation||selected!==sessionId)throw Error('工作台连接已变化。');
    await account.valid();
  });
  ipcMain.handle('local-dsh-connect', async (event) => { authorize(event, false); await start(event); return snapshot(); });
  ipcMain.handle('local-dsh-disconnect', async (event) => { authorize(event, false); await stop(); });
  ipcMain.handle("local-dsh-start", async (event) => { authorize(event); await start(event); return snapshot(); });
  ipcMain.handle("local-dsh-stop", async (event) => {
    authorize(event);
    const result = await dialog.showMessageBox(owner!, {
      type: "question", message: "停止本地 DSH？", detail: "进行中的本地任务会中断，已保存的历史和配置会保留。",
      buttons: ["继续运行", "停止 DSH"], defaultId: 0, cancelId: 0,
    });
    authorize(event);
    if (result.response === 1) await stop();
    return snapshot();
  });
  ipcMain.handle("local-dsh-show", async (event, bounds: DshBounds | null) => {
    authorize(event, bounds !== null);
    if (!bounds) { hide(); return; }
    if (!pageReady || !view) return;
    const zoom = event.sender.getZoomFactor();
    const size = owner!.getContentBounds();
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) throw Error("页面尺寸无效。");
    const x = Math.max(72, Math.round(bounds.x * zoom)), y = Math.max(80, Math.round(bounds.y * zoom));
    const width = Math.min(Math.round(bounds.width * zoom), size.width - x);
    const height = Math.min(Math.round(bounds.height * zoom), size.height - y);
    if (width < 1 || height < 1) { hide(); return; }
    owner!.addBrowserView(view);
    view.setBounds({ x, y, width, height });
    const pending = materialPanel;
    if (pending) {
      const current = view, currentAccount = account;
      materialPanel = undefined;
      if (pending.expiresAt <= Date.now()) return;
      try {
        await currentAccount?.valid();
        if (current !== view || currentAccount !== account || !isPage(event.sender.getURL())) return;
        await materialNavigation(current.webContents, pending.name, true);
      } catch (error) {
        if (view !== current || currentAccount !== account) return;
        if (!current.webContents.isDestroyed()) materialBridge.clearPending(current.webContents);
        pageError = error instanceof Error ? error.message : "资料无法在工作台打开，请重新选择。";
      }
    }
  });
  app.on("before-quit", (event) => {
    if (quitting || runtime.state.phase === "stopped") return;
    event.preventDefault();
    void stop().then(() => { quitting = true; app.quit(); }).catch(() => {
      void dialog.showMessageBox({ type: "error", message: "本地任务进程尚未退出，请稍后再次退出 DeepChat。" });
    });
  });
}
