import { app, BrowserView, BrowserWindow, dialog, ipcMain, nativeImage, session, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authority } from "./localFolderManage";
import { dshAccount, createDshRelay } from "./localDshAccount";
import { registerDshWorkbenchMaterialBridge } from "./dshWorkbenchMaterials";
import { registerDshWorkbenchLiteratureBridge } from "./dshWorkbenchLiterature";
import { registerTaskDshBridge } from './taskDshManage';
import type { DshBounds } from "../../src/types/localDsh";
import { ensureResearchPlugin, ensureTaskContextPlugin, researchPlugin } from "../utils/dshPlugin";
// Built independently by vite.config.ts; the packaged module has no repository-relative imports.
const { LocalDshRuntime, prepareAccountProfile, dshBrowserCompatibility } = require("./localDshRuntime") as typeof import("../../../../integrations/deepseek-harness/desktop/local-runtime");

export function registerLocalDshBridge() {
  let view: BrowserView | undefined, owner: BrowserWindow | undefined;
  let viewHost: { event: Electron.IpcMainInvokeEvent; origin: string; lifetime: AbortController } | undefined;
  let pageReady = false, pageError = "", starting: Promise<void> | undefined, stopping: Promise<void> | undefined;
  let quitting = false, observed: Electron.WebContents | undefined;
  const avatar = nativeImage.createFromPath(path.join(global.pathConfig.publicPath, 'icons', 'icon.png'))
    .resize({ width: 96 }).toDataURL();
  const directory = app.isPackaged ? path.join(process.resourcesPath, 'dsh') : path.resolve(app.getAppPath(), '.dsh-runtime');
  let runtime = new LocalDshRuntime(directory, '');
  let relay: Awaited<ReturnType<typeof createDshRelay>> | undefined;
  let account: Awaited<ReturnType<typeof dshAccount>> | undefined;
  let generation = 0, displayRequest = 0;
  let unwatchAccount: (() => void) | undefined;
  let taskHooks:ReturnType<typeof registerTaskDshBridge>;
  const accountWatch = setInterval(() => { if (account) void verifyAccount(account).catch(() => {}); }, 2000);
  accountWatch.unref();
  const snapshot = () => ({ ...runtime.state, ...(pageError ? { error: pageError } : {}), pageReady,
    accountId: account?.metadata.memberId, model: account?.metadata.model, bundled: true });
  const hide = () => {
    displayRequest++;
    if (view && owner && !owner.isDestroyed()) owner.removeBrowserView(view);
  };
  function disposeView() {
    hide();
    viewHost?.lifetime.abort();
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    view = undefined;
    viewHost = undefined;
    pageReady = false;
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
      let onDshPage = isPage(auth.contents.getURL());
      auth.contents.on("did-navigate-in-page", (_e, url, main) => {
        if (!main) return;
        const nextOnDshPage = isPage(url);
        if (!nextOnDshPage) hide();
        else if (!onDshPage && view && !view.webContents.isDestroyed())
          view.webContents.send("dsh-workbench-literature-reset");
        onDshPage = nextOnDshPage;
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
  function clearAccount() {
    unwatchAccount?.();
    unwatchAccount = undefined;
    account = undefined;
    const current = relay;
    relay = undefined;
    return current?.close();
  }
  async function verifyAccount(current: Awaited<ReturnType<typeof dshAccount>>) {
    try { await current.valid(); }
    catch (error) {
      if (account === current) void stop().catch(() => {});
      throw error;
    }
  }
  function stop() {
    if (stopping) return stopping;
    generation++;
    disposeView();
    pageError = "";
    const close = clearAccount(), inFlight = starting;
    stopping = (async () => {
      try { await close; }
      finally {
        try { await runtime.stop(); }
        finally { await inFlight?.catch(() => {}); }
      }
    })().finally(() => { stopping = undefined; });
    return stopping;
  }
  function openExternal(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
        void shell.openExternal(parsed.href);
    } catch { /* Ignore non-web schemes. */ }
  }
  async function start(event: Electron.IpcMainInvokeEvent) {
    if (stopping) await stopping;
    if (starting) return starting;
    const auth = authorize(event, false), epoch = generation;
    starting = (async () => {
      pageError = "";
      const next = await dshAccount(event);
      if (epoch !== generation) return;
      if (!next.metadata.enabled) throw Error('请先在 DeepChat「我的 → 模型设置」启用并选择默认模型，然后点击重试。');
      if (!account || account.identity !== next.identity || account.lease !== next.lease || account.metadata.fingerprint !== next.metadata.fingerprint || runtime.state.phase !== 'running') {
        disposeView(); await clearAccount();
        await runtime.stop();
        if (epoch !== generation) return;
        const connection = await createDshRelay(next,{
          taskContext:sessionId=>taskHooks.taskContext(sessionId),
          taskFeedback:value=>taskHooks.taskFeedback(value),
        });
        if (epoch !== generation) { await connection.close(); return; }
        relay = connection; account = next;
        unwatchAccount = next.watch(() => { void verifyAccount(next).catch(() => {}); });
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
      viewHost = { event, origin, lifetime: new AbortController() };
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
      if (epoch !== generation) return;
      disposeView(); await clearAccount();
      await runtime.stop();
      pageError = error instanceof Error ? error.message : '本地 DSH 连接失败，请重试。';
    }).finally(() => { starting = undefined; });
    return starting;
  }
  ipcMain.handle("local-dsh-status", (event) => { authorize(event); return snapshot(); });
  async function workbenchConnection(event: Electron.IpcMainInvokeEvent, requireActivePage: boolean) {
    const current = view, currentAccount = account, currentHost = viewHost, epoch = generation;
    if (!current || !currentAccount || !currentHost) throw Error("工作台尚未连接。");
    const contents = current.webContents;
    const assertView = () => {
      if (current !== view || currentAccount !== account || currentHost !== viewHost || epoch !== generation ||
          runtime.state.phase !== "running" || contents.isDestroyed() ||
          event.sender !== contents || event.senderFrame !== contents.mainFrame ||
          new URL(event.senderFrame.url).origin !== currentHost.origin ||
          (requireActivePage && (!pageReady || !isPage(currentHost.event.sender.getURL()))))
        throw Error("工作台连接已变化，请重新打开工作台。");
    };
    const valid = async () => {
      assertView();
      await verifyAccount(currentAccount);
      assertView();
    };
    await valid();
    const revoke = () => {
      if (currentAccount === account) void stop().catch(() => {});
    };
    return { account: currentAccount, hostEvent: currentHost.event, contents, valid, revoke, signal: currentHost.lifetime.signal };
  }
  registerDshWorkbenchMaterialBridge((event) => workbenchConnection(event, true));
  registerDshWorkbenchLiteratureBridge((event) => workbenchConnection(event, false));
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
    if (!pageReady || !view || !account) return;
    const current = view, currentAccount = account, request = ++displayRequest;
    await verifyAccount(currentAccount);
    if (request !== displayRequest || current !== view || currentAccount !== account || !pageReady) return;
    authorize(event);
    const zoom = event.sender.getZoomFactor();
    const size = owner!.getContentBounds();
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) throw Error("页面尺寸无效。");
    const x = Math.max(72, Math.round(bounds.x * zoom)), y = Math.max(80, Math.round(bounds.y * zoom));
    const width = Math.min(Math.round(bounds.width * zoom), size.width - x);
    const height = Math.min(Math.round(bounds.height * zoom), size.height - y);
    if (width < 1 || height < 1) { hide(); return; }
    owner!.addBrowserView(current);
    current.setBounds({ x, y, width, height });
  });
  app.on("before-quit", (event) => {
    if (quitting || runtime.state.phase === "stopped") return;
    event.preventDefault();
    void stop().then(() => { quitting = true; app.quit(); }).catch(() => {
      void dialog.showMessageBox({ type: "error", message: "本地任务进程尚未退出，请稍后再次退出 DeepChat。" });
    });
  });
}
