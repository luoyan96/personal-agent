import { localDeviceId } from './device-identity';
import { packWorkContext, validateHandoff, type WorkInputs, type ContextReceipt, type Handoff, type HandoffInput } from './work-memory';
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  realpath,
  lstat,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { archiveTaskFiles, type ArchiveReceipt, type ArchiveSelection } from './material-archive';
import { hashLocalFile, copyLocalMaterial } from './local-material-files';

export type TaskTarget = { kind: "research" | "personal"; taskId: string };
export type TaskContext = TaskTarget & {
  title: string;
  goal: string;
  version: number;
  agentId?: string;
};
export type TaskSource = {
  kind: "artifact" | "library";
  id: string;
  version: number;
  sha256: string;
  filename: string;
  localName: string;
};
export type TaskBinding = TaskTarget & {
  submissionOnly?: boolean;
  sessionId: string;
  sessionTitle?: string;
  sessionHistory?: {sessionId:string;title:string;at:string}[];
  contextFingerprint?: string;
  contextReceipt?: ContextReceipt;
  handoffs?: Handoff[];
  preferences?: {personalMemory:boolean;skills:string[]};
  deviceId: string;
  directory: string;
  agentId?: string;
  sources: TaskSource[];
  localMaterials?: { filename: string; localName: string; sha256: string; size: number }[];
  archive?: ArchiveReceipt;
  note: string;
  updatedAt: string;
  pending?: { requestId: string; text: string; userText?: string };
  lastRequestId?: string;
  delivery?: {
    id: string;
    summary: string;
    names: string[];
    status: "pending" | "submitted";
    versionConflict?: boolean;
  };
};
export type DshTaskEvent = {
  seq: number;
  type: string;
  time: number;
  data: any;
};
export type DshTaskState = {
  binding: TaskBinding;
  phase: "ready" | "running" | "finished" | "interrupted" | "failed";
  events: DshTaskEvent[];
  hasMore: boolean;
  needsApproval: boolean;
  files: { name: string; size: number }[];
};
export type TaskRpc = (
  method: string,
  request: Record<string, unknown>
) => Promise<any>;

const safeId = /^[A-Za-z0-9_-]{1,128}$/;
export function taskKey(target: TaskTarget) {
  if (
    !target ||
    !["research", "personal"].includes(target.kind) ||
    !safeId.test(target.taskId)
  )
    throw Error("任务标识无效。");
  return `${target.kind}-${target.taskId}`;
}
/** A readable default folder: the DSH sidebar lists folders by name, so never show a bare task id. */
export function defaultFolder(context: TaskContext) {
  const title = context.title
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 40)
    .replace(/[-.]+$/, "");
  return `${context.kind}-${title ? title + "-" : ""}${context.taskId.slice(0, 8)}`;
}
/** Task bindings are local receipts, never a second source of task/review authority. */
export class DshTaskWorkspace {
  private queues = new Map<string, Promise<unknown>>();
  constructor(
    readonly root: string,
    private rpc: TaskRpc,
    private valid: () => Promise<void>
  ) {}
  private async save(binding: TaskBinding) {
    await this.valid();
    const file = path.join(this.root, taskKey(binding) + ".json");
    await mkdir(this.root, { recursive: true });
    const temp = file + "." + randomUUID() + ".tmp";
    binding.updatedAt = new Date().toISOString();
    await writeFile(temp, JSON.stringify(binding), { mode: 0o600 });
    await rename(temp, file);
  }
  async load(target: TaskTarget): Promise<TaskBinding | undefined> {
    await this.valid();
    try {
      const b = JSON.parse(
        await readFile(path.join(this.root, taskKey(target) + ".json"), "utf8")
      );
      if (
        taskKey(b) !== taskKey(target) ||
        typeof b.sessionId !== "string" ||
        !safeId.test(b.sessionId) ||
        !path.isAbsolute(b.directory) ||
        !Array.isArray(b.sources)
      )
        throw Error("任务工作记录损坏，请保留目录并联系维护者。");
      return b;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
  async exclusive<T>(
    target: TaskTarget,
    operation: () => Promise<T>
  ): Promise<T> {
    const key = taskKey(target),
      previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.queues.set(key, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(key) === next) this.queues.delete(key);
    }
  }
  async open(context: TaskContext, selectedDirectory?: string) {
    return this.exclusive(context, async () => {
      let b = await this.load(context);
      if (!b) {
        const directory =
          selectedDirectory || path.join(this.root, "files", defaultFolder(context));
        await mkdir(directory, { recursive: true });
        b = {
          submissionOnly: true,
          kind: context.kind,
          taskId: context.taskId,
          sessionId: "acceptcat-" + randomUUID(),
          sessionTitle: `${context.title.slice(
            0,
            150
          )} · ${context.taskId.slice(0, 8)}`,
          deviceId: await localDeviceId(this.root),
          directory: await realpath(directory),
          agentId: context.agentId,
          sources: [],
          note: "",
          updatedAt: new Date().toISOString(),
        };
        // Reserve the identity before calling the host; a lost create response must not mint another session.
        await this.save(b);
      }
      await this.ensureSession(b, context);
      await this.valid();
      return b;
    });
  }
  private async ensureSession(b:TaskBinding, context:TaskContext) {
      const projection = await this.rpc("session/projections", {
        sessionId: b.sessionId,
      });
      if (!projection) {
        const workspace = await this.rpc("workspace/create", {
          path: b.directory,
        });
        const result = await this.rpc("session/create", {
          sessionId: b.sessionId,
          workspaceId: workspace.workspace.workspaceId,
        });
        if (result.sessionId !== b.sessionId)
          throw Error("DSH 返回了另一会话，未绑定到任务，请核对历史。");
        await this.rpc("session/rename", {
          sessionId: b.sessionId,
          title: b.sessionTitle || context.title,
        });
      }
      if (b.submissionOnly) {
        delete b.submissionOnly;
        await this.save(b);
      }
  }
  private async rotate(b:TaskBinding, context:TaskContext) {
    const state=await this.status(context);
    if(b.pending || state?.phase==='running')throw Error('请先结束本轮并核对未确认请求，再切换会话。');
    if((b.sessionHistory?.length||0)>=50)throw Error('本任务已保留 50 个历史会话，请归档任务后继续。');
    b.sessionHistory=[...(b.sessionHistory||[]),{sessionId:b.sessionId,title:b.sessionTitle||context.title,at:new Date().toISOString()}];
    b.sessionId='acceptcat-'+randomUUID();
    b.sessionTitle=`${context.title.slice(0,120)} · ${context.taskId.slice(0,8)} · ${b.sessionHistory.length+1}`;
    delete b.lastRequestId;
    await this.save(b);
    await this.ensureSession(b,context);
  }
  async newSession(context:TaskContext) {
    return this.exclusive(context,async()=>{
      const b=await this.load(context);if(!b)throw Error('请先打开任务。');
      // Resume a lost create response before reserving yet another identity.
      const projection=await this.rpc('session/projections',{sessionId:b.sessionId});
      if(!projection){await this.ensureSession(b,context);return;}
      await this.rotate(b,context);
    });
  }
  async abandonPending(context:TaskContext) {
    return this.exclusive(context,async()=>{
      const state=await this.status(context),b=state?.binding;
      if(!b?.pending)return;
      if(state?.phase==='running')throw Error('请先停止并核对原运行。');
      b.lastRequestId=b.pending.requestId;delete b.pending;await this.save(b);
      await this.rotate(b,context);
    });
  }
  async preferences(target:TaskTarget,value:{personalMemory:boolean;skills:string[]}) {
    if(!value||typeof value.personalMemory!=='boolean'||!Array.isArray(value.skills)||value.skills.length>2||value.skills.some(s=>typeof s!=='string'||!safeId.test(s)))throw Error('每轮最多选择两个 Skill。');
    return this.exclusive(target,async()=>{const b=await this.load(target);if(!b)throw Error('请先打开任务。');if(b.pending)throw Error('请先核对原请求。');b.preferences={personalMemory:value.personalMemory,skills:[...new Set(value.skills)]};await this.save(b);});
  }
  async checkpoint(target:TaskTarget,value:HandoffInput,expectedVersion:number,fingerprint:string) {
    const fields=validateHandoff(value);
    return this.exclusive(target,async()=>{
      const state=await this.status(target),b=state?.binding;if(!state||!b)throw Error('请先打开任务。');
      if(b.pending||state.phase==='running')throw Error('请先结束并核对本轮，再保存交接。');
      const version=b.handoffs?.at(-1)?.version||0;
      if(version!==expectedVersion)throw Error('交接摘要已更新，请刷新核对。');
      if(version>=100)throw Error('本任务已保留 100 版交接摘要。');
      const outputs=[] as Handoff['outputs'];
      for(const file of state.files.slice(0,20)){try{const bytes=await this.readOutput(target,file.name);outputs.push({name:file.name,sha256:createHash('sha256').update(bytes).digest('hex')});}catch{/* unsupported or oversized files are not claimed as verified evidence */}}
      const h:Handoff={...fields,version:version+1,sessionId:b.sessionId,throughSeq:state.events.at(-1)?.seq||0,createdAt:new Date().toISOString(),fingerprint,sourceRefs:b.sources.map(({id,version,sha256})=>({id,version,sha256})),outputs};
      b.handoffs=[...(b.handoffs||[]),h];await this.save(b);return h;
    });
  }
  async status(target: TaskTarget): Promise<DshTaskState | undefined> {
    const b = await this.load(target);
    if (!b) return;
    if (b.submissionOnly) return {
      binding: b, phase: "ready", events: [], hasMore: false,
      needsApproval: false, files: await this.files(b),
    };
    const projection = await this.rpc("session/projections", {
      sessionId: b.sessionId,
    });
    if (!projection || projection.kind !== "sequenced")
      throw Error("DSH 会话需要恢复或迁移，请重新打开任务。");
    const page = await this.rpc("session/page", {
      address: { kind: "session", sessionId: b.sessionId },
      throughSeq: projection.asOfSeq,
      maxMessages: 100,
    });
    const events: DshTaskEvent[] = page.records.map((r: any) => r.event);
    let running = false,
      found = false,
      cursor: string | undefined;
    for (let n = 0; n < 100; n++) {
      const list = await this.rpc("session/list", cursor ? { cursor } : {});
      const row = list.items.find((r: any) => r.sessionId === b.sessionId);
      if (row) {
        running = row.running === true;
        found = true;
        break;
      }
      cursor = list.nextCursor;
      if (!cursor) break;
    }
    if (!found) throw Error("暂时无法核对 DSH 运行状态，请刷新核对。");
    const last = [...events]
      .reverse()
      .find((e) => e.type === "turn/end" || e.type === "turn/start");
    const reason = last?.data.reason?.kind;
    const phase = running
      ? "running"
      : !last
      ? "ready"
      : last.type === "turn/start"
      ? "interrupted"
      : reason === "completed"
      ? "finished"
      : reason === "aborted" || reason === "interrupted"
      ? "interrupted"
      : "failed";
    await this.valid();
    // Keep model system context, request headers and hidden reasoning in the DSH host.
    const approvals = new Set<string>();
    for (const event of events) {
      if (event.type === "approval/asked") approvals.add(event.data.id);
      if (event.type === "approval/decided") approvals.delete(event.data.id);
    }
    const visible = events
      .filter((e) =>
        [
          "user/message",
          "assistant/message",
          "assistant/attempt",
          "tool/call",
          "tool/result",
          "turn/start",
          "turn/end",
        ].includes(e.type)
      )
      .filter(
        (e) => e.type !== "user/message" || e.data.source?.kind === "user"
      )
      .map((e) =>
        e.type === "assistant/message"
          ? {
              ...e,
              data: {
                message: {
                  content: (e.data.message?.content || []).filter(
                    (c: any) => c.type === "text"
                  ),
                },
              },
            }
          : e
      );
    return {
      binding: b,
      phase,
      events: visible,
      hasMore: page.hasMore,
      needsApproval: running && approvals.size > 0,
      files: await this.files(b),
    };
  }
  async cancel(target: TaskTarget) {
    const b = await this.load(target);
    if (!b) throw Error("请先打开任务。");
    await this.rpc("session/cancel", { sessionId: b.sessionId });
  }
  async prompt(context: TaskContext, text: string, requestId: string, inputs?: WorkInputs) {
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 16000 ||
      !safeId.test(requestId)
    )
      throw Error("请输入不超过 16000 字的任务要求。");
    return this.exclusive(context, async () => {
      const b = await this.load(context);
      if (!b) throw Error("请先打开任务工作区。");
      if (b.pending && b.pending.requestId !== requestId)
        throw Error("上一条请求结果尚待核对，请先重试原请求。");
      if (b.lastRequestId === requestId) return;
      if (b.pending && inputs && b.contextFingerprint!==inputs.fingerprint)throw Error('原请求的规则或记忆已变化，请核对原会话结果并结束待确认请求后继续。');
      if(inputs && !b.pending){
        if(b.contextFingerprint && b.contextFingerprint!==inputs.fingerprint){
          b.contextFingerprint=inputs.fingerprint;
          await this.rotate(b,context);
        }
        b.contextFingerprint=inputs.fingerprint;
      }
      await this.ensureSession(b,context);
      const materialGuide = '本机工作文件夹是主要材料来源。先列出目录并按需读取用户指定文件；资料清单和记忆不是文件正文。共享资料是选定版本的本地副本，保留出处；生成成果留在本机，由用户选择提交或归档，不自行上传或声明已验收。';
      const packed=inputs?packWorkContext(text,inputs,{id:context.taskId,version:context.version,kind:'task',title:context.title,content:context.goal+'\n'+materialGuide},b.handoffs?.at(-1),[
        ...b.sources.map(s=>({id:s.id,version:s.version,kind:'source' as const,title:s.filename,content:JSON.stringify(s)})),
        ...(b.localMaterials||[]).map(s=>({id:s.sha256,version:1,kind:'source' as const,title:s.filename,content:JSON.stringify({...s,origin:'local',note:'仅本机素材，sha256为选入时校验；读取当前内容后再作结论。'})})),
      ]):undefined;
      const legacyMessage = `任务：${context.title}\n任务 ID：${
        context.taskId
      }（版本 ${context.version}）\n目标：${
        context.goal
      }\n${materialGuide}\n本机素材：${JSON.stringify(b.localMaterials||[])}\n本任务资料清单：${JSON.stringify(b.sources)}\n\n本次要求：\n${text}`;
      const message=packed?.content??legacyMessage;
      if(packed&&!b.pending)b.contextReceipt=packed.receipt;
      if (!b.pending) {
        b.agentId = context.agentId;
        b.pending = { requestId, text: message, userText:text };
        await this.save(b);
      }
      await this.valid();
      await this.rpc("session/prompt", {
        sessionId: b.sessionId,
        requestId,
        mode: "queue",
        content: [{ type: "text", text: b.pending.text }],
      });
      b.lastRequestId = requestId;
      delete b.pending;
      await this.save(b);
    });
  }
  async note(target: TaskTarget, note: string) {
    if (typeof note !== "string" || note.length > 4000)
      throw Error("进度备注最多 4000 字。");
    return this.exclusive(target, async () => {
      const b = await this.load(target);
      if (!b) throw Error("请先打开任务。");
      b.note = note;
      await this.save(b);
    });
  }
  async importSource(
    target: TaskTarget,
    source: Omit<TaskSource, "localName">,
    bytes: Buffer
  ) {
    return this.exclusive(target, async () => {
      const b = await this.load(target);
      if (!b) throw Error("请先打开任务。");
      if (
        b.sources.length >= 95 &&
        !b.sources.some(
          (s) =>
            s.kind === source.kind &&
            s.id === source.id &&
            s.version === source.version
        )
      )
        throw Error("每个任务最多选入 95 个资料版本。");
      if (
        bytes.length < 1 ||
        bytes.length > 10485760 ||
        createHash("sha256").update(bytes).digest("hex") !== source.sha256
      )
        throw Error("资料大小或校验不符。");
      const duplicate = await this.sameMaterial(b, source.sha256);
      const localName = duplicate || `source-${source.kind}-${source.id}-v${source.version}${path
        .extname(source.filename)
        .replace(/[^.a-zA-Z0-9]/g, "")
        .slice(0, 12)}`;
      if (!safeId.test(source.id)) throw Error("资料标识无效。");
      const file = await this.filePath(b, localName, true);
      await this.valid();
      await writeFile(file, bytes, { flag: "wx" }).catch(async (error) => {
        if (
          error.code !== "EEXIST" ||
          createHash("sha256")
            .update(await readFile(file))
            .digest("hex") !== source.sha256
        )
          throw error;
      });
      if (
        !b.sources.some(
          (s) =>
            s.kind === source.kind &&
            s.id === source.id &&
            s.version === source.version
        )
      )
        b.sources.push({ ...source, localName });
      await this.save(b);
      return { ...source, localName };
    });
  }
  /** File paths only arrive here from the native picker, never from renderer input. */
  async importLocal(target: TaskTarget, selectedFiles: string[]) {
    return this.exclusive(target, async () => {
      const b = await this.load(target);
      if (!b) throw Error('请先选择本机工作文件夹。');
      if (!selectedFiles.length || selectedFiles.length > 20) throw Error('每次最多添加 20 个本地文件。');
      if ((b.localMaterials?.length || 0) + selectedFiles.length > 100) throw Error('最多记录 100 个补充素材；更多材料请直接使用工作文件夹。');
      for (const selected of selectedFiles) {
        const info = await lstat(selected);
        if (!info.isFile() || info.isSymbolicLink() || info.size < 1)
          throw Error('补充素材须为非空普通文件，不支持链接。');
        const {sha256,size} = await hashLocalFile(selected);
        if (size !== info.size) throw Error('素材正在变化，请保存后重新选择。');
        const filename = path.basename(selected);
        // The working directory may already contain this exact file; no upload or second copy is needed.
        const relative = path.relative(b.directory, await realpath(selected));
        let localName: string | undefined;
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
          await this.filePath(b, relative);
          localName = relative;
        }
        localName ||= await this.sameMaterial(b, sha256);
        localName ||= `local-${sha256.slice(0, 16)}-${filename.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(-120)}`;
        const destination = await this.filePath(b, localName, true);
        await this.valid();
        try { const copied=await copyLocalMaterial(selected,destination); if(copied.sha256!==sha256)throw Error('素材已变化，请保存后重新选择。'); }
        catch(e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || (await hashLocalFile(destination)).sha256 !== sha256) throw e; }
        b.localMaterials ||= [];
        if (!b.localMaterials.some(s => s.localName === localName && s.sha256 === sha256))
          b.localMaterials.push({ filename, localName, sha256, size });
        await this.save(b);
      }
      return b.localMaterials;
    });
  }
  private async sameMaterial(b: TaskBinding, sha256: string) {
    // Only selected material receipts are deduplicated; unrelated working files are not scanned or uploaded.
    for (const s of [...b.sources, ...(b.localMaterials || [])].filter(s => s.sha256 === sha256)) {
      try {
        const file = await this.filePath(b, s.localName), info = await lstat(file);
        if (info.isFile() && (await hashLocalFile(file)).sha256 === sha256) return s.localName;
      } catch { /* Missing or modified copies are not reused. */ }
    }
  }
  async archive(target: TaskTarget, selection: ArchiveSelection,
    checkCollection: () => Promise<void>, post: (url: string, body: unknown, key: string) => Promise<any>, rebase = false) {
    return this.exclusive(target, async () => {
      const b = await this.load(target);
      if (!b) throw Error('请先打开任务工作区。');
      return archiveTaskFiles({ root: this.root, taskKey: taskKey(target), taskId: target.taskId,
        selection, current: b.archive, rebase, read: name => this.readOutput(target, name), valid: this.valid,
        sourcePath:name=>this.filePath(b,name), checkCollection, post, save: async receipt => { b.archive = receipt; await this.save(b); } });
    });
  }
  async importOriginal(target:TaskTarget,source:Omit<TaskSource,'localName'>,temporary:string) {
    return this.exclusive(target,async()=>{
      const b=await this.load(target);if(!b)throw Error('请先打开任务。');
      if(!safeId.test(source.id)||b.sources.length>=95)throw Error('资料标识或数量超出范围。');
      const hash=await hashLocalFile(temporary);
      if(hash.sha256!==source.sha256)throw Error('资料校验不符，未选入。');
      const localName=await this.sameMaterial(b,source.sha256)||`source-${source.kind}-${source.id}-v${source.version}${path.extname(source.filename).replace(/[^.a-zA-Z0-9]/g,'').slice(0,12)}`;
      const destination=await this.filePath(b,localName,true);await this.valid();
      try{await copyLocalMaterial(temporary,destination)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST'||(await hashLocalFile(destination)).sha256!==source.sha256)throw error}
      if(!b.sources.some(s=>s.kind===source.kind&&s.id===source.id&&s.version===source.version))b.sources.push({...source,localName});
      await this.save(b);return {...source,localName};
    });
  }
  async stageMethod(target:TaskTarget,name:string,version:string,files:{path:string;text:string}[]) {
    if(!safeId.test(name)||!/^[a-f0-9]{64}$/.test(version)||files.length>300||files.reduce((n,f)=>n+Buffer.byteLength(f.text,'utf8'),0)>900000)throw Error('方法资料超出范围。');
    return this.exclusive(target,async()=>{
      const b=await this.load(target);if(!b)throw Error('请先打开任务。');
      const relative=`.acceptcat-methods/${name}-${version.slice(0,16)}`;
      for(const file of files){
        if(!file.path||file.path.includes('\\')||file.path.split('/').some(p=>!p||p==='.'||p==='..'||p.includes(':')))throw Error('方法资料路径无效。');
        const parts=(relative+'/'+file.path).split('/');
        for(let i=1;i<parts.length;i++)await mkdir(await this.filePath(b,parts.slice(0,i).join('/'),true)).catch(e=>{if(e.code!=='EEXIST')throw e;});
        const destination=await this.filePath(b,relative+'/'+file.path,true);
        await this.valid();
        await writeFile(destination,file.text,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST'||await readFile(destination,'utf8')!==file.text)throw Error('本地方法副本已改变，请核对后移走该副本再重试。');});
      }
      return relative;
    });
  }
  async filePath(b: TaskBinding, name: string, create = false) {
    if (
      !name ||
      name.includes("\0") ||
      path.isAbsolute(name) ||
      name.split(/[\\/]/).some((p) => p === ".." || p === "" || p.includes(":"))
    )
      throw Error("文件路径无效。");
    const root = await realpath(b.directory),
      candidate = path.resolve(root, name),
      relative = path.relative(root, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw Error("文件不在任务目录中。");
    let current = root;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw Error("不读取链接指向的文件。");
      } catch (e) {
        if (
          !create ||
          current !== candidate ||
          (e as NodeJS.ErrnoException).code !== "ENOENT"
        )
          throw e;
      }
    }
    return candidate;
  }
  async readOutput(target: TaskTarget, name: string) {
    const b = await this.load(target);
    if (!b) throw Error("请先打开任务。");
    const file = await this.filePath(b, name),
      info = await lstat(file);
    if (!info.isFile() || info.size < 1 || info.size > 10485760)
      throw Error("成果文件须为 1 字节至 10 MiB。");
    const bytes = await readFile(file);
    await this.valid();
    if (bytes.length > 10485760) throw Error("成果文件超过 10 MiB。");
    return bytes;
  }
  /** Only native-picker paths enter here. Staging never starts an Agent or uploads files. */
  async addDeliverables(context: TaskContext, selectedFiles: string[]) {
    return this.exclusive(context, async () => {
      if (context.kind !== "research") throw Error("个人协作任务暂支持文字成果。");
      if (!selectedFiles.length || selectedFiles.length > 5)
        throw Error("每次最多添加 5 个成果文件。");
      let b = await this.load(context);
      if (b?.delivery?.status === "pending") throw Error("请先重试并核对上次提交。");
      if (b?.pending || (b && !b.submissionOnly && (await this.status(context))?.phase === "running"))
        throw Error("请先结束本轮并核对未确认请求，再添加成果。");
      // Validate the entire selection before creating a local workspace.
      const selected = [];
      for (const file of selectedFiles) {
        if (!/\.(txt|md|csv|tsv|json|pdf|png)$/i.test(file))
          throw Error("直接提交支持 TXT、MD、CSV、TSV、JSON、PDF、PNG；Office 原件请先归档到资料。");
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 10485760)
          throw Error("直接提交的单个成果须为 1 字节至 10 MiB 的普通文件；较大原件请先归档到资料。");
        selected.push({ file, ...await hashLocalFile(file) });
      }
      if (!b) {
        const directory = path.join(this.root, "files", defaultFolder(context));
        await mkdir(directory, { recursive: true });
        b = {
          taskId: context.taskId, kind: context.kind, agentId: context.agentId,
          submissionOnly: true, sessionId: "acceptcat-" + randomUUID(),
          deviceId: await localDeviceId(this.root), directory: await realpath(directory),
          sources: [], note: "", updatedAt: new Date().toISOString(),
        };
        await this.save(b);
      }
      const names: string[] = [];
      for (const file of selected) {
        const folder = path.join("deliverables", file.sha256);
        // Check each parent before writing through the workspace path boundary.
        for (const relative of ["deliverables", folder]) {
          const destination = await this.filePath(b, relative, true);
          await mkdir(destination, { recursive: false }).catch(error => {
            if (error.code !== "EEXIST") throw error;
          });
        }
        const name = path.join(folder, path.basename(file.file));
        const destination = await this.filePath(b, name, true);
        await this.valid();
        try {
          const copy = await copyLocalMaterial(file.file, destination, 10485760);
          if (copy.sha256 !== file.sha256) throw Error("文件已变化，请重新添加。");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST" ||
              (await hashLocalFile(destination)).sha256 !== file.sha256) throw error;
        }
        names.push(name);
      }
      return [...new Set(names)];
    });
  }
  /** Persist exact write intents before dispatch. Lost responses reuse the same server dedup keys and bytes. */
  async deliver(
    context: TaskContext,
    summary: string,
    names: string[],
    post: (url: string, body: unknown, key: string) => Promise<any>,
    maySubmit: boolean
  ) {
    if (
      typeof summary !== "string" ||
      !summary.trim() ||
      summary.length > 8000 ||
      !Array.isArray(names) ||
      names.length > 5 ||
      new Set(names).size !== names.length
    )
      throw Error("请填写成果摘要，每次最多提交 5 个文件。");
    return this.exclusive(context, async () => {
      const b = await this.load(context);
      if (!b) throw Error("请先打开任务工作区。");
      let receipt: string;
      let delivery: any;
      if (
        b.delivery &&
        b.delivery.summary === summary &&
        JSON.stringify(b.delivery.names) === JSON.stringify(names)
      ) {
        receipt = path.join(
          this.root,
          taskKey(context) + ".delivery." + b.delivery.id + ".json"
        );
        delivery = JSON.parse(await readFile(receipt, "utf8"));
        if (delivery.id !== b.delivery.id)
          throw Error("成果记录不一致，请保留记录并核对。");
        if (delivery.done) {
          b.delivery.status = "submitted";
          await this.save(b);
          return delivery.result;
        }
      } else {
        if (b.delivery?.status === "pending")
          throw Error("有一版成果尚未确认，请先重试该版本，避免重复交付。");
        if (!maySubmit) throw Error("当前任务不能提交成果。");
        if (context.kind === "personal" && names.length)
          throw Error("个人协作任务暂支持文字成果。");
        const files = [];
        for (const name of names) {
          if (!/\.(txt|md|csv|tsv|json|pdf|png)$/i.test(name))
            throw Error("成果支持 TXT/Markdown/CSV/JSON/PDF/PNG。");
          const bytes = await this.readOutput(context, name),
            ext = path.extname(name).toLowerCase();
          files.push({
            filename: path.basename(name),
            contentBase64: bytes.toString("base64"),
            mediaType:
              ext === ".pdf"
                ? "application/pdf"
                : ext === ".png"
                ? "image/png"
                : "text/plain",
          });
        }
        delivery = {
          id: randomUUID(),
          summary,
          names,
          files,
          uploaded: [],
          version: context.version,
          sources: b.sources.map((s) => ({
            kind: s.kind === "artifact" ? "artifact" : "note",
            locator:
              s.kind === "artifact"
                ? s.id
                : `research-library:${s.id}:v${s.version}:${s.sha256}`,
            label: `${s.filename} v${s.version}`.slice(0, 200),
          })),
        };
        receipt = path.join(
          this.root,
          taskKey(context) + ".delivery." + delivery.id + ".json"
        );
        await writeFile(receipt, JSON.stringify(delivery), { mode: 0o600 });
        b.delivery = { id: delivery.id, summary, names, status: "pending" };
        await this.save(b);
      }
      const persist = async () => {
        await this.valid();
        const temp = receipt + ".tmp";
        await writeFile(temp, JSON.stringify(delivery), { mode: 0o600 });
        await rename(temp, receipt);
      };
      try {
        for (let i = delivery.uploaded.length; i < delivery.files.length; i++) {
          const artifact = await post(
            "/api/v1/artifacts",
            {
              taskId: context.taskId,
              expectedVersion: delivery.version,
              ...delivery.files[i],
            },
            `${delivery.id}_file_${i}`
          );
          delivery.uploaded.push(artifact.id);
          delivery.version++;
          await persist();
        }
        const result =
          context.kind === "personal"
            ? await post(
                `/api/v1/work/tasks/${context.taskId}/result`,
                { expectedVersion: delivery.version, text: delivery.summary },
                delivery.id
              )
            : await post(
                `/api/v1/tasks/${context.taskId}/deliverables`,
                {
                  expectedVersion: delivery.version,
                  summary: delivery.summary,
                  artifactRefs: [
                    ...new Set([
                      ...delivery.uploaded,
                      ...delivery.sources
                        .filter((s: any) => s.kind === "artifact")
                        .map((s: any) => s.locator),
                    ]),
                  ],
                  sources: delivery.sources,
                },
                delivery.id
              );
        delivery.done = true;
        delivery.result = result;
        await persist();
        b.delivery = { id: delivery.id, summary, names, status: "submitted" };
        await this.save(b);
        return result;
      } catch (error) {
        if (
          (error as Error & { code?: string }).code === "VERSION_CONFLICT" &&
          b.delivery
        ) {
          b.delivery.versionConflict = true;
          await this.save(b);
        }
        throw error;
      }
    });
  }
  /** Only a definite server rejection can replace a write intent; ambiguous writes keep their original keys. */
  async rebaseDelivery(context: TaskContext) {
    return this.exclusive(context, async () => {
      const b = await this.load(context);
      if (!b?.delivery?.versionConflict) throw Error("请先核对原提交结果。");
      const receipt = path.join(
        this.root,
        taskKey(context) + ".delivery." + b.delivery.id + ".json"
      );
      const d = JSON.parse(await readFile(receipt, "utf8"));
      if (d.id !== b.delivery.id || d.done)
        throw Error("提交已变化，请刷新核对。");
      d.version = context.version;
      d.id = randomUUID();
      await this.valid();
      await writeFile(
        path.join(this.root, taskKey(context) + ".delivery." + d.id + ".json"),
        JSON.stringify(d),
        { mode: 0o600 }
      );
      b.delivery = { ...b.delivery, id: d.id, versionConflict: false };
      await this.save(b);
    });
  }
  private async files(b: TaskBinding) {
    const result: { name: string; size: number }[] = [];
    const walk = async (relative: string, depth: number) => {
      if (depth > 3 || result.length >= 100) return;
      for (const entry of await readdir(path.join(b.directory, relative), {
        withFileTypes: true,
      })) {
        if (result.length >= 100) break;
        if (
          entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.isSymbolicLink()
        )
          continue;
        const name = path.join(relative, entry.name);
        if (entry.isDirectory()) await walk(name, depth + 1);
        else if (entry.isFile())
          result.push({
            name,
            size: (await lstat(await this.filePath(b, name))).size,
          });
      }
    };
    await walk("", 0);
    return result;
  }
}
