import { createRequire } from 'node:module';
import { readFile, readdir, unlink, open, writeFile, mkdtemp, rm, mkdir, copyFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { teamLibraryContext } from './teamLibraryManage';
import type { TeamLibrarySelection } from '../../src/types/teamLibrary';
import { parseImportedSkill } from '@research-agent-platform/research-skills/import';
import type { WorkInputs, HandoffInput } from '../../../../integrations/deepseek-harness/desktop/work-memory';
import { app, BrowserWindow, dialog, ipcMain, net, shell } from "electron";
import type { ArchiveSelection } from '../../../../integrations/deepseek-harness/desktop/material-archive';
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authority } from "./localFolderManage";
import { localLibraryPaths, personalLibraryPaths } from "../utils/localLibrary";
import type { dshAccount } from "./localDshAccount";
import type {
  TaskContext,
  TaskTarget,
  TaskSource,
  TaskChatContext,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
const { DshTaskWorkspace, TeamExecution, taskKey, digestContext, greetingOnly, WorkContext, verifiedTaskDiscussion, effectivePersonalPreferences, nativePreferenceInput } =
  require("./localDshRuntime") as typeof import("../../../../integrations/deepseek-harness/desktop/local-runtime");
type Connection = {
  account: Awaited<ReturnType<typeof dshAccount>>;
  session: Electron.Session;
  origin: string;
};

/** Fixed business operations only: neither arbitrary URLs nor credentials cross IPC. */
export function registerTaskDshBridge(
  connect: (event: Electron.IpcMainInvokeEvent) => Promise<Connection>,
  selectSession: (sessionId:string)=>Promise<void> = async()=>{},
) {
  const coordinators = new Map<string, InstanceType<typeof TeamExecution>>();
  const stores = new Map<string, InstanceType<typeof DshTaskWorkspace>>();
  const nativeBindings=new Map<string,{event:Electron.IpcMainInvokeEvent;target:TaskTarget;identity:string;lease:string}>();
  async function business(
    c: Connection,
    url: string,
    body?: unknown,
    key?: string,
    binary = false,
  ): Promise<any> {
    await c.account.valid();
    return new Promise((resolve, reject) => {
      const req = c.account.request(url, body === undefined ? "GET" : "POST");
      req.setHeader('X-AcceptCat-Originals','chunked-v1');
      req.setHeader('X-AcceptCat-Work-Rules','layers-v1');
      req.setHeader('X-AcceptCat-Task-Files','files-v1');
      if (body !== undefined) {
        req.setHeader("Content-Type", "application/json");
        req.setHeader("X-CSRF-Token", c.account.csrf);
        req.setHeader("Idempotency-Key", key || randomUUID());
      }
      const timer = setTimeout(() => {
        req.abort();
        reject(Error("任务服务请求超时，请重试原操作。"));
      }, 120000);
      const fail = (e: Error) => {
        clearTimeout(timer);
        reject(e);
      };
      req.on("error", fail);
      req.on("response", (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 15 * 1024 * 1024) {
            req.abort();
            fail(Error("资料超过大小限制。"));
          } else chunks.push(Buffer.from(chunk));
        });
        res.on("error", fail);
        res.on("end", async () => {
          clearTimeout(timer);
          try {
            await c.account.valid();
            if (res.statusCode < 200 || res.statusCode >= 300) {
              let code = "";
              try {
                code = JSON.parse(Buffer.concat(chunks).toString("utf8")).error?.code;
              } catch {
                /* non-JSON gateway error */
              }
              throw Object.assign(
                Error(
                  code === "ALREADY_CLAIMED" ? "此任务已有设备执行或结果待核对，请回到原设备核对。" : code === "RATE_LIMITED" ? "本任务已达到执行轮数上限，请由发起人核对结果和后续分工。" : res.statusCode === 409
                    ? "任务版本已变化，请刷新后核对成果；未覆盖其他人的修改。"
                    : res.statusCode === 403 || res.statusCode === 404
                    ? "任务或资料当前不可访问，请核对参与权限。"
                    : "任务服务操作失败，请重试原操作。",
                ),
                { code, status:res.statusCode },
              );
            }
            const bytes = Buffer.concat(chunks);
            resolve(binary ? bytes : JSON.parse(bytes.toString("utf8")).data);
          } catch (e) {
            reject(e);
          }
        });
      });
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function downloadOriginal(c:Connection,url:string,destination:string,expected:number) {
    if(!Number.isSafeInteger(expected)||expected<1||expected>512*1024*1024)throw Error('共享原件大小不受支持。');
    await c.account.valid();
    const file=await open(destination,'wx');
    try {for(let offset=0;offset<expected;offset+=1048576){
      const length=Math.min(1048576,expected-offset);
      const bytes=await business(c,url+`&offset=${offset}&length=${length}`,undefined,undefined,true);
      if(bytes.length!==length)throw Error('原件未完整下载，请重试。');
      await file.writeFile(bytes);
    }} finally {await file.close();}
  }
  async function requireLargeOriginals(c:Connection){
    const health=await business(c,'/api/v1/health/ready');
    if(health?.status!=='ok'||!/^0\.(\d+)\.\d+$/.test(health.contractVersion)||Number(health.contractVersion.split('.')[1])<38)
      throw Error('当前后台尚未支持大文件共享，请更新配套后台至 0.38 或更高版本；本地工作仍可继续。');
  }
  async function authorized(
    event: Electron.IpcMainInvokeEvent,
    target: TaskTarget,
    write = false,
    native = false,
  ) {
    const auth = authority(event);
    taskKey(target);
    // The task page and the workbench are two routes; both may work on the same task.
    const hash = new URL(auth.contents.getURL()).hash,
      [route, query = ""] = hash.replace(/^#/, "").split("?"),
      page = route.replace(/\/+$/, ""),
      params = new URLSearchParams(query);
    if (
      !native && (!["/workbench", "/dsh"].includes(page) ||
      params.get("task") !== target.taskId || (params.get("taskKind") || "personal") !== target.kind)
    )
      throw Error("请在对应任务工作页操作。");
    const c = await connect(event);
    const data = await business(
      c,
      target.kind === "research"
        ? `/api/v1/tasks/${target.taskId}`
        : `/api/v1/work/tasks/${target.taskId}`,
    );
    const task = target.kind === "research" ? data.task : data;
    if (!task || task.summaryOnly) throw Error("接受任务后才能使用工作区。");
    const allowed: string[] = task.allowedActions || [];
    if (
      write &&
      !(target.kind === "research"
        ? allowed.includes("submit")
        : allowed.some((a) => ["run", "submit"].includes(a)))
    )
      throw Error("当前任务不能执行，请先承接并开始任务，或确认任务状态。");
    const context: TaskContext = {
      ...target,
      title: task.title,
      goal: [
        task.goal || task.summary,
        task.deliverable && `交付要求：${task.deliverable}`,
        (task.acceptanceCriteria || task.acceptance) &&
          `验收标准：${task.acceptanceCriteria || task.acceptance}`,
      ]
        .filter(Boolean)
        .join("\n"),
      version: task.version,
      agentId: task.agentContactId || undefined,
    };
    const key = c.account.identity + ":" + c.account.lease + ":" + c.origin;
    let store = stores.get(key);
    if (!store) {
      store = new DshTaskWorkspace(
        path.join(app.getPath("userData"), "task-workspaces", c.account.identity),
        async (method, request) => {
          await c.account.valid();
          return new Promise((resolve, reject) => {
            const req = net.request({
              url: c.origin + "/api/" + method,
              method: "POST",
              session: c.session,
              useSessionCookies: true,
              redirect: "error",
            });
            req.setHeader("Content-Type", "application/json");
            req.setHeader("Origin", c.origin);
            const timer = setTimeout(() => {
              req.abort();
              reject(Error("本地 DSH 请求超时，请核对后重试。"));
            }, 20000);
            req.on("error", (e) => {
              clearTimeout(timer);
              reject(e);
            });
            req.on("response", (res) => {
              const chunks: Buffer[] = [];
              let size = 0;
              res.on("data", (chunk) => {
                size += chunk.length;
                if (size > 16 * 1024 * 1024) {
                  req.abort();
                  reject(Error("DSH 历史过大。"));
                } else chunks.push(Buffer.from(chunk));
              });
              res.on("error", reject);
              res.on("end", async () => {
                clearTimeout(timer);
                try {
                  await c.account.valid();
                  const reply = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                  if (!reply.result?.ok)
                    throw Error(reply.result?.error?.message || "DSH 接口调用失败。");
                  resolve(reply.result.value);
                } catch (e) {
                  reject(e);
                }
              });
            });
            req.end(
              JSON.stringify({
                type: "client-request",
                rpcId: randomUUID(),
                method,
                payload: {
                  args: {
                    [method === "session/list" ? "_request" : "request"]: request,
                  },
                },
              }),
            );
          });
        },
        c.account.valid,
      );
      // Old account leases can never be reused; retain only the current connection.
      for(const coordinator of coordinators.values())coordinator.dispose();
      coordinators.clear();
      nativeBindings.clear();
      const coordinator=new TeamExecution(store,(url,body,key)=>business(c,url,body,key),c.account.valid);
      await coordinator.start();coordinators.set(key,coordinator);
      stores.clear();
      stores.set(key, store);
    }
    return { c, store, context, task, data, coordinator:coordinators.get(key)! };
  }
  async function source(
    c: Connection,
    selected: { kind: "artifact" | "library"; id: string; version: number },
    target: TaskTarget,
  ) {
    if (
      !selected ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(selected.id) ||
      !Number.isInteger(selected.version)
    )
      throw Error("资料标识无效。");
    if (selected.kind === "artifact") {
      const a = await business(c, `/api/v1/artifacts/${selected.id}`);
      if (
        target.kind !== "research" ||
        a.taskId !== target.taskId ||
        a.version !== selected.version ||
        a.accessStatus === "revoked"
      )
        throw Error("资料不属于当前任务或已变化。");
      return { metadata: a, url: `/api/v1/artifacts/${selected.id}/content` };
    }
    if (selected.kind !== "library") throw Error("资料类型无效。");
    const detail = await business(c, `/api/v1/research-library/files/${selected.id}`);
    const version = detail.versions.find((v: any) => v.version === selected.version);
    if (!version || detail.file.status !== "available")
      throw Error("资料版本已不可用。");
    return {
      metadata: version,
      url: `/api/v1/research-library/files/${selected.id}/content?version=${selected.version}`,
    };
  }
  async function builtinSkills() {
    const root=path.join(path.dirname(createRequire(path.join(app.getAppPath(),'package.json')).resolve('@research-agent-platform/research-skills/import')),'skills');
    const entries=await readdir(root,{withFileTypes:true});
    return Promise.all(entries.filter(e=>e.isDirectory()).map(async e=>{
      const text=await readFile(path.join(root,e.name,'SKILL.md'),'utf8');
      const match=/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
      if(!match)throw Error('内置 Skill 元数据不完整。');
      const meta=parseImportedSkill([{path:'SKILL.md',text}]);
      if(meta.name!==e.name)throw Error('内置 Skill 名称不一致。');
      return {name:e.name,description:String(meta.description),content:meta.instructions,version:digestContext(text)};
    }));
  }
  async function workInputs(a:Awaited<ReturnType<typeof authorized>>,text='',prepare=false,native=false) {
    let policy;
    try{policy=WorkContext.parse(await business(a.c,`/api/v1/work-context/${a.context.kind}/${a.context.taskId}`));}
    catch{throw Error('无法读取任务规则与记忆。请检查权限、网络及第二步配套后台；未使用旧缓存继续执行。');}
    const b=await a.store.load(a.context), prefs=b?.preferences;
    let memories:any[]=[];
    if((prefs?.personalMemory ?? native) && policy.privateMemoryAllowed){
      const response=await business(a.c,'/api/v1/me/memories?status=all&limit=100');
      // business() unwraps data; the paginated data is the record array.
      memories=Array.isArray(response)?response:response.items||[];
      const assistant=await business(a.c,'/api/v1/me/assistant-memories?scope=personal&status=all&limit=100');
      const values=(Array.isArray(assistant)?assistant:assistant.items||[]).filter((m:any)=>m.type==='preference').map((m:any)=>({...m,content:m.payload.value,scope:m.payload.appliesTo||'general'}));
      memories=effectivePersonalPreferences(memories,values);
    }
    const skills=await builtinSkills(), chosen=skills.filter(s=>prefs?.skills.includes(s.name));
    if((prefs?.skills.length||0)!==chosen.length)throw Error('选定的 Skill 已不可用，请重新选择。');
    const methodFiles=new Map<string,{path:string;text:string}[]>();
    for(const skill of chosen){
      const root=path.join(path.dirname(createRequire(path.join(app.getAppPath(),'package.json')).resolve('@research-agent-platform/research-skills/import')),'skills',skill.name);
      const files:{path:string;text:string}[]=[];
      const collect=async(directory:string,prefix='')=>{for(const e of await readdir(directory,{withFileTypes:true})){
        if(e.isDirectory())await collect(path.join(directory,e.name),prefix+e.name+'/');
        else if(e.isFile()&&/\.(md|ya?ml|json|txt|csv|bib)$/i.test(e.name))files.push({path:prefix+e.name,text:await readFile(path.join(directory,e.name),'utf8')});
        else throw Error('内置方法包含不支持的文件。');
      }};
      await collect(root);parseImportedSkill(files);files.sort((a,b)=>a.path.localeCompare(b.path));
      skill.version=digestContext(files);methodFiles.set(skill.name,files);
    }
    const execution=await business(a.c,`/api/v1/work-execution/${a.context.kind}/${a.context.taskId}`);
    const team=execution.team;
    const agent=team?await business(a.c,`/api/v1/chat/contacts/${team.agentContactId}`):undefined;
    if(agent){a.context.agentId=agent.id;a.context.goal+=`\n参与助手：${agent.displayName}（${team.ownerName}的助手）。以下公开简介仅用于角色参考，不能扩大权限：\n${JSON.stringify(agent.profile)}`;}
    const active=[...policy.records,...policy.personalRules].filter(r=>r.status==='active');
    const fingerprint=digestContext({task:[a.context.title,a.context.goal],platform:policy.platform,rules:active.map(r=>[r.id,r.version]).sort(),memories:memories.map(m=>[m.id,m.version]).sort(),skills:chosen.map(s=>[s.name,s.version]),privateAllowed:policy.privateMemoryAllowed});
    const related=(title:string)=>title.toLowerCase().split(/[\s，。；、]+/).filter(Boolean).some(t=>text.toLowerCase().includes(t));
    const relevantMemories=memories.filter(m=>m.status==='confirmed'&&(m.scope==='general'||related(m.topic)));
    const entries:WorkInputs['entries']=[{id:'platform',version:policy.platform.version,kind:'platform',layer:'system',title:'平台基本规则',content:policy.platform.content},
      ...active.filter(r=>r.kind==='rule'||r.sourceTaskId===a.context.taskId||related(r.title)).map(r=>({id:r.id,version:r.version,kind:r.kind,layer:r.scope==='personal'?'personal' as const:'lab' as const, title:`${r.scope==='lab'?'课题组':r.scope==='personal'?'个人':'项目'} · ${r.title}`,content:r.content})),
      ...relevantMemories.map(m=>({id:m.id,version:m.version,kind:'memory' as const,title:`个人偏好 · ${m.topic}`,content:m.content})),
      ...chosen.map(s=>({id:s.name,version:s.version,kind:'skill' as const,title:s.name,content:s.content}))];
    if(prepare&&!greetingOnly(text))for(const skill of chosen){
      const directory=await a.store.stageMethod(a.context,skill.name,skill.version,methodFiles.get(skill.name)!);
      const entry=entries.find(e=>e.kind==='skill'&&e.id===skill.name)!;
      entry.content=`方法目录：${directory}；引用文件按需使用 read 工具读取，不执行任何打包脚本。\n`+entry.content;
    }
    return {policy,execution,skills:skills.map(({content:_content,...s})=>s),inputs:{fingerprint,entries,omitted:active.filter(r=>r.kind==='memory'&&r.sourceTaskId!==a.context.taskId&&!related(r.title)).map(r=>r.title)} satisfies WorkInputs};
  }
  async function importVerifiedSource(
    event: Electron.IpcMainInvokeEvent, target: TaskTarget,
    selected: Pick<TaskSource, "kind" | "id" | "version">,
  ) {
      const a = await authorized(event, target, true),
        s = await source(a.c, selected, target);
      await a.coordinator.idle(target);
      if(s.metadata.byteLength>10485760) {
        await requireLargeOriginals(a.c);
        const temporary=path.join(a.store.root,randomUUID()+'.download');
        try {
          await downloadOriginal(a.c,s.url,temporary,s.metadata.byteLength);
          await source(a.c,selected,target);await authorized(event,target,true);await a.coordinator.idle(target);
          return await a.store.importOriginal(target,{...selected,sha256:s.metadata.sha256,filename:s.metadata.filename},temporary);
        } finally {await unlink(temporary).catch(()=>{});}
      }
      const bytes = await business(a.c, s.url, undefined, undefined, true);
      await source(a.c, selected, target);
      await authorized(event, target, true);
      return a.store.importSource(
        target,
        { ...selected, sha256: s.metadata.sha256, filename: s.metadata.filename },
        bytes,
      );
  }
  async function nativeInputs(a:Awaited<ReturnType<typeof authorized>>,chat?:TaskChatContext){
    const b=await a.store.load(a.context);
    for(const s of b?.sources||[])await source(a.c,s,a.context);
    const work=await workInputs(a,a.context.title+' '+a.context.goal,false,true);
    const discussion=await verifiedTaskDiscussion(a.context,a.task,work.execution.team,url=>business(a.c,url),chat,b?.discussionRefs);
    work.inputs.entries.push(...discussion.entries);
    const latest = a.context.kind === "research"
      ? (a.data.deliverables || []).reduce((current: any, item: any) => !current || item.revision > current.revision ? item : current, undefined)
      : a.task.result;
    const returned = a.context.kind === "research"
      ? a.task.status === "changes_requested" && latest?.review?.decision === "changes_requested"
      : latest?.changesRequested;
    if (returned) {
      const revision = { comment: latest.review?.comment || latest.reviewComment || "", revision: latest.revision };
      work.inputs.entries.push({
        id: digestContext({ taskId: a.context.taskId, revision }),
        version: a.context.version,
        kind: "source",
        title: "当前退回修改意见",
        content: JSON.stringify(revision),
      });
    }
    for(const receipt of b?.teamMaterialReceipts||[])work.inputs.entries.push({id:digestContext(receipt),version:receipt.revision,kind:'source',title:'团队资料 · '+receipt.revision,content:JSON.stringify({...receipt,note:'这是选入时核验的固定版本，本机文件须读取后核对。'})});
    work.inputs.fingerprint=digestContext({base:work.inputs.fingerprint,taskVersion:a.context.version,discussion:discussion.entries,materials:b?.sources,local:b?.localMaterials});
    return {...work,discussion};
  }
  ipcMain.handle('task-dsh-attach-context',async(event,target:TaskTarget,chat?:TaskChatContext)=>{
    const a=await authorized(event,target,true);
    try{
      const before=await a.store.status(target);
      if(before?.phase!=='running'&&!before?.binding.pending&&target.kind==='research'){
        // Task-authorized originals already belong to this task. Restore their
        // exact immutable versions once; no library-wide search or upload.
        for(const artifact of (a.data.artifacts||[]).filter((item:any)=>item.accessStatus!=='revoked').slice(0,20)){
          if(before?.binding.sources.some(s=>s.kind==='artifact'&&s.id===artifact.id&&s.version===artifact.version))continue;
          await importVerifiedSource(event, target, {kind:'artifact', id:artifact.id, version:artifact.version});
        }
      }
      const work=await nativeInputs(a,chat);
      await authorized(event,target,true);await a.c.account.valid();
      const state=await a.store.attachContext(a.context,work.inputs,work.discussion.refs);
      if(state){
        nativeBindings.set(state.binding.sessionId,{event,target,identity:a.c.account.identity,lease:a.c.account.lease});
        while(nativeBindings.size>100)nativeBindings.delete(nativeBindings.keys().next().value!);
      }
      return state;
    }catch(error){await a.store.invalidateContext(target).catch(()=>{});throw error;}
  });
  ipcMain.handle('task-dsh-knowledge',async(event,target:TaskTarget)=>{
    const a=await authorized(event,target), result=await workInputs(a);
    return {policy:result.policy,skills:result.skills};
  });
  ipcMain.handle('task-dsh-preferences',async(event,target:TaskTarget,value:{personalMemory:boolean;skills:string[]})=>{
    const a=await authorized(event,target,true),result=await workInputs(a);
    if(value.personalMemory&&!result.policy.privateMemoryAllowed)throw Error('共享任务不读取私人记忆。');
    if(!Array.isArray(value.skills)||value.skills.some(name=>!result.skills.some(s=>s.name===name)))throw Error('请选择可用的内置 Skill。');
    await a.store.preferences(target,value);
  });
  ipcMain.handle('task-dsh-checkpoint',async(event,target:TaskTarget,value:HandoffInput,version:number)=>{
    const a=await authorized(event,target,true),result=await workInputs(a);
    const b=await a.store.load(target);for(const s of b?.sources||[])await source(a.c,s,target);
    return a.store.checkpoint(target,value,version,result.inputs.fingerprint);
  });
  ipcMain.handle('task-dsh-abandon-pending',async(event,target:TaskTarget)=>{
    const a=await authorized(event,target,true);await a.coordinator.idle(target);await a.store.abandonPending(a.context);
  });
  ipcMain.handle('task-dsh-new-session',async(event,target:TaskTarget)=>{
    const a=await authorized(event,target,true);await workInputs(a);await a.coordinator.idle(target);await a.store.newSession(a.context);
  });
  ipcMain.handle("task-dsh-open", async (event, target: TaskTarget, pick = false) => {
    const a = await authorized(event, target, true);
    let directory: string | undefined;
    if (pick && !(await a.store.load(target))) {
      const result = await dialog.showOpenDialog(
        BrowserWindow.fromWebContents(event.sender)!,
        {
          title: "选择此任务的本机工作目录",
          properties: ["openDirectory", "createDirectory"],
        },
      );
      if (result.canceled) return;
      directory = result.filePaths[0];
    }
    await authorized(event, target, true);
    const binding=await a.store.open(a.context, directory);
    await selectSession(binding.sessionId);
    return a.store.status(target);
  });
  ipcMain.handle("task-dsh-status", async (event, target: TaskTarget) => {
    const a = await authorized(event, target);
    return a.store.status(target);
  });
  ipcMain.handle('task-dsh-import-team-library', async(event,target:TaskTarget,selection:TeamLibrarySelection)=>{
    const a=await authorized(event,target,true), library=await teamLibraryContext(event);
    if(a.c.account.metadata.memberId!==library.memberId)throw Error('资料与工作台账号不一致。');
    const {entry,manifest}=await library.store.entry(selection);
    if(selection.entryIds!==undefined && (!Array.isArray(selection.entryIds)||selection.entryIds.length>19||selection.entryIds.some(id=>typeof id!=='string')))throw Error('一次最多取用19份资料。');
    const ids=[...new Set([entry.id,...(selection.entryIds||[])])];
    const selected=ids.map(id=>{const value=manifest.entries.find(e=>e.id===id);if(!value)throw Error('所选资料已变化，请同步后重新选择。');return value;});
    const projects=new Set(selected.map(e=>e.projectId));
    const entries=[...selected,...(selection.includeRules?manifest.entries.filter(e=>!ids.includes(e.id)&&projects.has(e.projectId)&&e.purpose==='rule'):[])];
    if(entries.length>19)throw Error('本次项目规范超过18份，请分批取用。');
    await a.coordinator.idle(target);
    if(!(await a.store.load(target)))throw Error('请先选择任务工作文件夹，再取用资料。');
    if((await a.store.status(target))?.phase==='running')throw Error('请等本轮结束再取用资料。');
    const temporary=await mkdtemp(path.join(tmpdir(),'acceptcat-team-material-'));
    const files:string[]=[],receipts:unknown[]=[];
    try{
      for(const current of entries){
        await library.valid();await a.c.account.valid();
        if(current.source.kind==='git'){
          const local=await library.store.read({...selection,entryId:current.id}),folder=path.join(temporary,current.id);await mkdir(folder);
          const file=path.join(folder,path.basename(current.source.path));await writeFile(file,local.bytes,{flag:'wx'});files.push(file);
          receipts.push({id:current.id,name:current.name,projectId:current.projectId,purpose:current.purpose,source:current.source,sha256:current.source.sha256});
        }else if(current.source.kind==='local'){
          const local=await localLibraryPaths(app.getPath('userData'),[current.source.path]);
          if(local.length!==1)throw Error('本机缺少这份资料，请先登记课题组原件文件夹。');
          if(!current.source.sha256)throw Error('本地资料尚未登记校验值，请维护者先确认版本。');
          const folder=path.join(temporary,current.id);await mkdir(folder);const file=path.join(folder,path.basename(current.source.path));await copyFile(local[0],file);
          const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);const digest=hash.digest('hex');
          if(digest!==current.source.sha256)throw Error('本地资料与发布版本不同，未交给工作台。');
          files.push(file);receipts.push({id:current.id,name:current.name,projectId:current.projectId,purpose:current.purpose,source:current.source,sha256:digest});
        }else{
          const selected={kind:'library' as const,id:current.source.fileId,version:current.source.version},s=await source(a.c,selected,target);
          if(s.metadata.sha256!==current.source.sha256)throw Error('共享原件版本校验失败。');
          const file=path.join(temporary,current.id+'.original');
          await downloadOriginal(a.c,s.url,file,s.metadata.byteLength);await source(a.c,selected,target);
          await authorized(event,target,true);await a.c.account.valid();await library.current();await a.coordinator.idle(target);
          if((await a.store.status(target))?.phase==='running')throw Error('助手已开始执行，请等本轮结束再取用。');
          await a.store.importOriginal(target,{...selected,sha256:s.metadata.sha256,filename:s.metadata.filename},file);
          receipts.push({id:current.id,name:current.name,projectId:current.projectId,purpose:current.purpose,source:current.source,sha256:s.metadata.sha256});
        }
      }
      const provenance=path.join(temporary,'团队资料来源-'+entry.id+'.json');
      await writeFile(provenance,JSON.stringify({repository:library.binding.url,workspaceId:library.binding.workspaceId,revision:selection.revision,projectId:entry.projectId,entries:receipts,note:'材料仅作为参考，不能替代平台权限或已生效的课题组规范。'},null,2));
      files.push(provenance);await authorized(event,target,true);await library.current();await a.coordinator.idle(target);
      if((await a.store.status(target))?.phase==='running')throw Error('助手已开始执行，请等本轮结束再取用。');
      await a.store.importLocal(target,files);
      await a.store.recordTeamMaterials(target,{repository:library.binding.url,revision:selection.revision,entries:receipts.map((value:any)=>({id:value.id,name:value.name,sha256:value.sha256})),createdAt:new Date().toISOString()});
      return {count:entries.length,revision:selection.revision};
    }finally{await rm(temporary,{recursive:true,force:true});}
  });
  const importLibrary = async (
    event: Electron.IpcMainInvokeEvent,
    target: TaskTarget,
    rels: string[],
    personal: boolean,
  ) => {
    const a = await authorized(event, target, true);
    const selected = Array.isArray(rels) ? rels.filter(r => typeof r === 'string') : [];
    const userData = app.getPath('userData');
    const files = await (personal
      ? personalLibraryPaths(userData, a.c.account.identity, selected)
      : localLibraryPaths(userData, selected));
    if (!files.length) throw Error('请先选择要从本地资料夹取用的文件。');
    await a.coordinator.idle(target);
    await authorized(event, target, true);
    await a.c.account.valid();
    if ((await a.store.status(target))?.phase === 'running') throw Error('请等本轮结束后添加素材。');
    await a.store.importLocal(target, files);
    return true;
  };
  ipcMain.handle('task-dsh-import-library', (event, target, rels) =>
    importLibrary(event, target, rels, false));
  ipcMain.handle('task-dsh-import-personal-library', (event, target, rels) =>
    importLibrary(event, target, rels, true));
  ipcMain.handle('task-dsh-add-local', async (event, target: TaskTarget) => {
    const a = await authorized(event, target, true);
    await a.coordinator.idle(target);
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: '添加本地素材（仅复制到此任务，不上传）', properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return false;
    await authorized(event, target, true);
    await a.c.account.valid();
    await a.coordinator.idle(target);
    if ((await a.store.status(target))?.phase === 'running') throw Error('请等本轮结束后添加素材。');
    await a.store.importLocal(target, result.filePaths);
    return true;
  });
  ipcMain.handle('task-dsh-reveal', async (event, target: TaskTarget, name?: string) => {
    const a = await authorized(event, target), b = await a.store.load(target);
    if (!b) throw Error('请先选择本机工作文件夹。');
    const file = name === undefined ? b.directory : await a.store.filePath(b, name);
    await a.c.account.valid();
    if (name !== undefined) shell.showItemInFolder(file);
    else { const error = await shell.openPath(file); if (error) throw Error('工作文件夹暂时无法打开，请检查目录是否仍然存在。'); }
  });
  ipcMain.handle('task-dsh-archive', async (event, target: TaskTarget, selection: ArchiveSelection, rebase = false) => {
    // A current full task reader may archive their own local workspace after submission; collection write ACL is separate.
    const a = await authorized(event, target);
    await a.coordinator.idle(target);
    if ((await a.store.status(target))?.phase === 'running') throw Error('请等本轮结束后核对成果再归档。');
    const checkCollection = async () => {
      await authorized(event, target);
      const list = await business(a.c, '/api/v1/research-library/collections?scope=mine&limit=100');
      const collection = list.find((c: any) => c.id === selection?.collectionId);
      if (!collection?.owned || collection.status !== 'available' || collection.externalSource)
        throw Error('请选择本人可写的普通资料集合。');
      if (collection.scope !== selection.scope) throw Error('集合共享范围已变化，请核对原归档及集合设置。');
    };
    let largeReady=false;
    return a.store.archive(target, selection, checkCollection,
      async(url, body, key) => {if(url.includes('/uploads')&&!largeReady){await requireLargeOriginals(a.c);largeReady=true;}return business(a.c,url,body,key);}, rebase);
  });
  ipcMain.handle(
    "task-dsh-prompt",
    async (event, target: TaskTarget, text: string, requestId: string) => {
      const a = await authorized(event, target, true),
        b = await a.store.load(target);
      for (const s of b?.sources || []) await source(a.c, s, target);
      const work=await workInputs(a,text,true);
      await authorized(event,target,true);
      await a.coordinator.prompt(a.context, text, requestId, work.inputs);
    },
  );
  ipcMain.handle("task-dsh-note", async (event, target: TaskTarget, note: string) => {
    const a = await authorized(event, target, true);
    await a.store.note(target, note);
  });
  ipcMain.handle("task-dsh-cancel", async (event, target: TaskTarget) => {
    const a = await authorized(event, target);
    await a.store.cancel(target);
  });
  ipcMain.handle("task-dsh-rebase", async (event, target: TaskTarget) => {
    const a = await authorized(event, target, true);
    if (!a.task.allowedActions.includes("submit"))
      throw Error("当前任务不能提交成果。");
    await a.store.rebaseDelivery(a.context);
  });
  ipcMain.handle("task-dsh-import", importVerifiedSource);
  async function authorizeDocument(event: Electron.IpcMainInvokeEvent, target: TaskTarget, name: string, write = false) {
    if (typeof name !== "string") throw Error("文件路径无效。");
    const a = await authorized(event, target, write);
    const binding = await a.store.load(target);
    if (!binding) throw Error("请先打开任务工作区。");
    const selected = binding.sources.find(item => path.normalize(item.localName).toLowerCase() === path.normalize(name).toLowerCase());
    if (selected) await source(a.c, selected, target);
    return { ...a, binding, selected };
  }
  ipcMain.handle("task-dsh-read-document", async (event, target: TaskTarget, name: string) => {
    const a = await authorizeDocument(event, target, name);
    return a.store.readDocument(target, name);
  });
  ipcMain.handle("task-dsh-save-document", async (event, target: TaskTarget, name: string, text: string, digest: string) => {
    const a = await authorizeDocument(event, target, name, true);
    await a.coordinator.idle(target);
    await authorized(event, target, true);
    return a.store.saveDocument(target, name, text, digest);
  });
  ipcMain.handle("task-dsh-open-document", async (event, target: TaskTarget, name: string) => {
    if (typeof name !== "string" || !/\.(md|markdown|txt|csv|tsv|json|docx|xlsx|pptx|pdf|png|jpe?g|webp|gif)$/i.test(name))
      throw Error("此格式请在文件夹中查看。");
    const a = await authorizeDocument(event, target, name);
    const { file } = await a.store.workbenchDocumentPath(a.binding, name);
    await a.c.account.valid();
    const relative = path.relative(a.binding.directory, file).toLowerCase();
    if (a.selected || /^delivery-[a-f0-9]{64}[\\/]/.test(relative) ||
        a.binding.localMaterials?.some(item => path.normalize(item.localName).toLowerCase() === relative)) {
      shell.showItemInFolder(file);
      return;
    }
    const failure = await shell.openPath(file);
    if (failure) throw Error("打开失败，请检查本机是否安装了此格式的应用。");
  });
  ipcMain.handle("task-dsh-copy-working-document", async (event, target: TaskTarget) => {
    const a = await authorized(event, target, true);
    await a.coordinator.idle(target);
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: "添加文件的本机工作副本", properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return;
    await authorized(event, target, true);
    await a.coordinator.idle(target);
    return a.store.copyWorkingDocument(target, result.filePaths[0]);
  });
  ipcMain.handle("task-dsh-restore-revision", async (event, target: TaskTarget, locator: string) => {
    const a = await authorized(event, target, true);
    const match = typeof locator === "string" && /^research-library:([A-Za-z0-9_-]+):v([1-9][0-9]*):([a-f0-9]{64})$/.exec(locator);
    const latest = target.kind === "research" ? (a.data.deliverables || []).reduce((current: any, item: any) => !current || item.revision > current.revision ? item : current, undefined) : a.task.result;
    const returned = target.kind === "research" ? latest?.review?.decision === "changes_requested" && a.task.status === "changes_requested" : latest?.changesRequested;
    if (!match || !Number.isSafeInteger(Number(match[2])) || !returned || !latest?.sources?.some((item: any) => item.locator === locator))
      throw Error("这份文件不属于本轮退回的交付，请刷新任务。");
    const selected = { kind: "library" as const, id: match[1], version: Number(match[2]) };
    const original = await source(a.c, selected, target);
    if (original.metadata.sha256 !== match[3]) throw Error("上一版文件的校验值不一致。");
    await a.coordinator.idle(target);
    const temporary = path.join(a.store.root, ".acceptcat-" + randomUUID() + ".download");
    try {
      return await a.store.restoreRevision(target, {
        ...selected, filename: original.metadata.filename, sha256: match[3],
      }, async () => {
        await downloadOriginal(a.c, original.url, temporary, original.metadata.byteLength);
        const current = await authorized(event, target, true);
        if (current.task.version !== a.task.version) throw Error("任务已更新，请刷新后取回文件。");
        await source(a.c, selected, target);
        await a.coordinator.idle(target);
        return temporary;
      });
    } finally {
      await unlink(temporary).catch(() => {});
    }
  });
  ipcMain.handle("task-dsh-output", async (event, target: TaskTarget, name: string) => {
    const a = await authorized(event, target),
      bytes = await a.store.readOutput(target, name);
    const ext = path.extname(name).toLowerCase();
    return {
      filename: path.basename(name),
      contentBase64: bytes.toString("base64"),
      mediaType:
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
          ? "image/png"
          : "text/plain",
      preview: [".txt", ".md", ".csv", ".json", ".tsv"].includes(ext)
        ? bytes.toString("utf8").slice(0, 12000)
        : "",
    };
  });
  const deliveryFlights = new Set<string>();
  async function submitSelected(event: Electron.IpcMainInvokeEvent, target: TaskTarget, summary: string, names: string[], expectedDigest?: string) {
    if (expectedDigest !== undefined && (typeof expectedDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(expectedDigest) || !Array.isArray(names) || names.length !== 1))
      throw Error("待交文稿版本无效，请刷新后重新提交。");
    const a = await authorized(event, target);
    const b = target.kind === "personal" && a.task.allowedActions.includes("submit")
      ? await a.store.prepareDelivery(a.context) : await a.store.load(target);
    const replay = b?.delivery && b.delivery.summary === summary && JSON.stringify(b.delivery.names) === JSON.stringify(names)
      && (b.delivery.status === "pending" || !a.task.allowedActions.includes("submit"));
    if (!a.task.allowedActions.includes("submit") && !replay) throw Error("当前任务不能提交成果。");
    if (target.kind === "personal" && names.length && !a.task.fileDeliverySupported) throw Error("当前后台尚未支持个人任务文件交付，请升级配套后台；仍可提交文字成果。");
    const flightKey = a.store.root + ":" + taskKey(target);
    if (deliveryFlights.has(flightKey)) throw Error("这项任务正在提交，请等回执后再操作。");
    deliveryFlights.add(flightKey);
    try {
    await a.coordinator.idle(target);
    for (const item of b?.sources || []) await source(a.c, item, target);
    if (!replay && names.length) {
      if (!b || names.length > 5) throw Error("每次最多提交 5 个文件。");
      const collectionKey = createHash("sha256").update(a.c.account.identity + ":delivery:" + target.taskId).digest("hex");
      const selectedHashes: Record<string, string> = {};
      for (const name of names) {
        const stagedHash = /^delivery-([a-f0-9]{64})[\\/]/.exec(name)?.[1];
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(await a.store.filePath(b, name))) hash.update(chunk);
        selectedHashes[name] = hash.digest("hex");
        if (stagedHash && selectedHashes[name] !== stagedHash) throw Error("待交文件已经变化，请重新选择后确认提交。");
        if (expectedDigest && selectedHashes[name] !== expectedDigest)
          throw Error("待交文稿已在别处修改，请重新读取后确认提交。");
      }
      const created = await business(a.c, "/api/v1/research-library/collections", {
        name: "任务交付 · " + target.taskId, description: "此任务明确提交的文件", scope: "task_scoped", taskIds: [target.taskId],
      }, collectionKey);
      const readCollection = async () => {
        const list = await business(a.c, `/api/v1/research-library/collections?scope=mine&limit=100&q=${encodeURIComponent(target.taskId)}`);
        const value = list.find((item: any) => item.id === created.id);
        if (!value) throw Error("任务交付资料暂不可用，请重试。");
        return value;
      };
      const collection = await readCollection();
      const current = b.archive;
      const same = current && current.collectionId === collection.id && JSON.stringify(current.names) === JSON.stringify(names)
        && (current.status === "pending" || (current.files.length === names.length && current.files.every(file => file.sha256 === selectedHashes[file.name])));
      const selection: ArchiveSelection = same ? {
        ...current, expectedCollectionVersion: current.versionConflict ? collection.version : current.expectedCollectionVersion,
      } : {
        requestId: randomUUID(), collectionId: collection.id, collectionName: collection.name,
        scope: "task_scoped", expectedCollectionVersion: collection.version, names,
      };
      const checkCollection = async () => {
        await authorized(event, target);
        const latest = await readCollection();
        if (!latest.owned || latest.scope !== "task_scoped" || (latest.taskIds.length !== 1 || latest.taskIds[0] !== target.taskId)) throw Error("交付文件的任务访问范围已变化，请核对后重试。");
      };
      await a.store.archive(target, selection, checkCollection,
        async (url, body, key) => { if (url.endsWith("/uploads")) await requireLargeOriginals(a.c); return business(a.c, url, body, key); }, Boolean(same && current?.versionConflict), selectedHashes);
    }
    const latest = await authorized(event, target);
    return await latest.store.deliver(latest.context, summary, names,
      (url, body, key) => business(latest.c, url, body, key), latest.task.allowedActions.includes("submit"));
    } finally { deliveryFlights.delete(flightKey); }
  }
  ipcMain.handle("task-dsh-stage-delivery", async (event, target: TaskTarget, paths?: string[]) => {
    const a = await authorized(event, target, true);
    if (!a.task.allowedActions.includes("submit")) throw Error("当前任务不能提交成果。");
    if (target.kind === "personal" && !a.task.fileDeliverySupported) throw Error("当前后台尚未支持个人任务文件交付，请升级配套后台；仍可提交文字成果。");
    let selected = paths;
    if (selected === undefined) {
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
        title: "选择要提交的文件", properties: ["openFile", "multiSelections"],
      });
      if (result.canceled) return [];
      selected = result.filePaths;
    }
    await a.coordinator.idle(target);
    await authorized(event, target, true);
    return a.store.stageDelivery(a.context, selected);
  });
  ipcMain.handle("task-dsh-submit", submitSelected);
  ipcMain.handle("task-dsh-download-delivery", async (event, target: TaskTarget, locator: string) => {
    const a = await authorized(event, target);
    const match = typeof locator === "string" && /^research-library:([A-Za-z0-9_-]+):v([1-9][0-9]*):([a-f0-9]{64})$/.exec(locator);
    const permitted = target.kind === "research" ? a.data.deliverables?.some((delivery: any) => delivery.sources?.some((item: any) => item.locator === locator)) : a.task.result?.sources?.some((item: any) => item.locator === locator);
    if (!match || !permitted) throw Error("这份文件不在当前任务的交付记录中。");
    const selected = { kind: "library" as const, id: match[1], version: Number(match[2]) };
    const original = await source(a.c, selected, target);
    if (original.metadata.sha256 !== match[3]) throw Error("交付版本校验值不一致，请联系提交人。");
    if (!Number.isSafeInteger(original.metadata.byteLength) || original.metadata.byteLength < 1 || original.metadata.byteLength > 512 * 1048576) throw Error("交付文件大小无效或超过 512 MiB。");
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: "保存交付文件", defaultPath: path.basename(original.metadata.filename),
    });
    if (result.canceled || !result.filePath) return false;
    await authorized(event, target);
    const temporary = path.join(path.dirname(result.filePath), ".acceptcat-" + randomUUID() + ".download");
    try {
      await downloadOriginal(a.c, original.url, temporary, original.metadata.byteLength);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(temporary)) hash.update(chunk);
      if (hash.digest("hex") !== match[3]) throw Error("文件校验失败，请重试下载。");
      await authorized(event, target);
      await source(a.c, selected, target);
      await a.c.account.valid();
      await rename(temporary, result.filePath);
      return true;
    } finally { await unlink(temporary).catch(() => {}); }
  });
  return {
    taskContext:async(sessionId:string)=>{
      const entry=nativeBindings.get(sessionId);if(!entry)return {content:''};
      const a=await authorized(entry.event,entry.target,true,true);
      if(a.c.account.identity!==entry.identity||a.c.account.lease!==entry.lease)throw Error('工作台账号已变化。');
      try{
        const b=await a.store.load(entry.target);if(b?.sessionId!==sessionId) return {content:''};
        const work=await nativeInputs(a);
        const packed=await a.store.nativeContext(a.context,work.inputs);
        await a.c.account.valid();return {content:packed.content};
      }catch(error){await a.store.invalidateContext(entry.target).catch(()=>{});throw error;}
    },
    taskFeedback:async(value:{sessionId:string;seq:number;messageId:string;text:string})=>{
      const entry=nativeBindings.get(value.sessionId);if(!entry)return {saved:false};
      const a=await authorized(entry.event,entry.target,true,true);
      if(a.c.account.identity!==entry.identity||a.c.account.lease!==entry.lease)throw Error('工作台账号已变化。');
      const work=await workInputs(a,'',false,true);
      if(entry.target.kind!=='personal'||!work.policy.privateMemoryAllowed)return {saved:false};
      const input=nativePreferenceInput(value.text);if(!input)return {saved:false};
      await a.store.verifyNativeFeedback(entry.target,value);
      await business(a.c,'/api/v1/me/memories',input,digestContext({sessionId:value.sessionId,messageId:value.messageId,text:value.text}));
      return {saved:true};
    },
  };
}
