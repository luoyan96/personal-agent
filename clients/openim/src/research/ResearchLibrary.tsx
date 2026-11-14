import { Alert, App, Button, Input, Modal, Select, Segmented } from "antd";
import { FileTextOutlined, FolderOutlined, UploadOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from 'react-router-dom';
import type { ResponseFor } from "@research-agent-platform/contracts";
import { researchApi, ResearchApiError } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { workspaceAvailability, readFeishuLibrarySharingAvailability } from "./workspace-availability";
import { withRequestDeadline } from "./request-deadline";
import { researchScopeLabels } from "./research-library-api";
import { ResearchFileDownload } from "./ResearchFileDownload";
import "./research-library.scss";
import { ZoteroImport } from "./ZoteroImport";
import { FeishuImport } from "./FeishuImport";
import { ResearchFileImport as FileImport } from "./ResearchFileImport";
import { LibraryAgent } from "./LibraryAgent";
import { FeishuLibrarySource } from "./FeishuLibrarySource";
type ResearchCollection = ResponseFor<"researchCollections">["data"][number];
type ResearchFile = ResponseFor<"researchFiles">["data"][number];

async function libraryAvailability(signal: AbortSignal) {
  return withRequestDeadline(async (requestSignal) => {
    const response = await fetch("/api/v1/health/ready", { signal: requestSignal, credentials: "omit" });
    if (!response.ok) throw new Error("资料服务暂不可连接，请重新检查。");
    return workspaceAvailability(await response.json(), 24);
  }, 10000, signal);
}
const scopeOptions = Object.entries(researchScopeLabels).map(([value, label]) => ({ value, label }));
const failureText = (error: unknown) => error instanceof Error ? error.message : "操作未完成，草稿已保留，请重试。";

function CollectionEditor({ collection, onClose, onSaved }: { collection?: ResearchCollection; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(collection?.name || "");
  const [description, setDescription] = useState(collection?.description || "");
  const [scope, setScope] = useState<ResearchCollection["scope"]>(collection?.scope || "owner_private");
  const [taskIds, setTaskIds] = useState(collection?.taskIds || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const version = useRef(collection?.version);
  const operation = usePersonalOperation(true, `collection-editor:${collection?.id || "new"}`);
  const hasLab = useResearchStore(s => s.actor?.spaceKind === "laboratory");
  const sharing = useResearchRead(readFeishuLibrarySharingAvailability, "feishu-library-sharing-availability", !!collection?.externalSource);
  const availableScopes = collection?.externalSource ? [
    { value: "owner_private", label: "仅自己（私人资料）" },
    { value: "lab_shared", label: "课题组共享", disabled: !hasLab || !sharing.data?.available },
  ] : scopeOptions;
  const tasks = useResearchRead((signal) => researchApi("workbench", { query: { category: "all", limit: 100 }, signal }), "library-task-options", scope === "task_scoped");
  const { modal } = App.useApp();
  const save = async () => {
    if (!name.trim() || busy || (scope === "task_scoped" && !taskIds.length)) return;
    if (collection?.externalSource && scope === "lab_shared" && (!hasLab || !sharing.data?.available)) { setError("飞书资料库共享尚未就绪，请核对课题组身份和后台版本。"); return; }
    const { isCurrent } = operation.capture(); setBusy(true); setError("");
    try {
      const settings = { name: name.trim(), description, scope, taskIds: scope === "task_scoped" ? taskIds : [] };
      if (collection) await researchApi("updateResearchCollection", { params: { id: collection.id }, body: { expectedVersion: version.current!, settings } });
      else await researchApi("createResearchCollection", { body: settings });
      if (!isCurrent()) return;
      await onSaved(); if (isCurrent()) onClose();
    } catch (error) {
      if (isCurrent()) {
        setError(failureText(error));
        if (collection && error instanceof ResearchApiError && error.code === "VERSION_CONFLICT") {
          try { const current = await researchApi("researchCollections", { query: { scope: "mine", limit: 100 } }); if (isCurrent()) version.current = current.data.find(c => c.id === collection.id)?.version ?? version.current; } catch { /* Retain the draft and its original version until a successful re-read. */ }
        }
      }
    } finally { if (isCurrent()) setBusy(false); }
  };
  return <Modal title={collection ? "集合设置" : "新建资料集合"} open onCancel={() => !busy && onClose()} maskClosable={!busy} closable={!busy} footer={null}>
    <div className="research-library-form">
      <label>集合名称<Input aria-label="集合名称" maxLength={200} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <label>说明<Input.TextArea aria-label="集合说明" maxLength={4000} rows={3} value={description} disabled={busy} onChange={e => setDescription(e.target.value)} /></label>
      <label>资料范围<Select aria-label="资料范围" options={availableScopes} value={scope} disabled={busy} onChange={setScope} /></label>
      {collection?.externalSource && !hasLab && <p className="research-library-muted">你当前使用个人空间，加入课题组后可以共享资料库。</p>}
      {collection?.externalSource && hasLab && !sharing.data?.available && <p role="status" className="research-library-muted">{sharing.error || (sharing.data ? "当前后台尚未启用飞书资料库共享，需升级后台后使用；私人资料库仍可使用。" : "正在检查资料库共享服务…")}<Button type="link" size="small" onClick={sharing.refresh}>重新检查</Button></p>}
      {scope === "task_scoped" && <label>获准任务<Select mode="multiple" aria-label="资料授权任务" value={taskIds} disabled={busy || !tasks.data} onChange={setTaskIds} options={tasks.data?.data.filter(c => c.taskId && !c.summaryOnly && c.source === "research_task").map(c => ({ value: c.taskId!, label: c.title }))} />{tasks.error && <Alert type="warning" message={tasks.error} action={<Button onClick={tasks.refresh}>重试</Button>} />}<small>仅本页可完整查看的科研任务；没有可选任务时，可先保存为仅自己。</small></label>}
      <p className="research-library-muted">{scope === "public" ? "公开集合会让注册用户读取原始资料，请确认材料可公开。" : scope === "lab_shared" ? collection?.externalSource ? "课题组成员可查看此库，并通过你为这个库提供的飞书连接只读查询。其他飞书资料和账号授权不会共享；打开原表仍需飞书自身权限。改回仅自己后停止后续查询，已保存到成员对话的文字不会被删除。" : "课题组当前成员可读取资料，成员变化后使用时会重新核对权限。" : scope === "task_scoped" ? "仅获准完整查看所选科研任务的人可读取。" : "仅你本人可读取；可选择课题组共享，不随 Agent 名片公开。"}</p>
      {error && <Alert type="error" message={error} />}
      <Button type="primary" loading={busy} disabled={!name.trim() || (scope === "task_scoped" && !taskIds.length)} onClick={() => collection?.externalSource && scope === "lab_shared" && collection.scope !== "lab_shared" ? modal.confirm({ title: "将此资料库共享给课题组？", content: "本课题组成员将能查看这个库，通过你为此库提供的连接查询原表中你可读的记录，并将查询文字保存在各自的对话中。你的其他飞书资料和账号授权不会共享。你可随时改回仅自己，停止后续查询。", okText: "确认共享", onOk: save }) : scope === "public" && collection?.scope !== "public" ? modal.confirm({ title: "公开此集合的资料？", content: "其他注册用户将可读取与下载集合中的原始资料。", onOk: save }) : void save()}>保存集合</Button>
    </div>
  </Modal>;
}

function SourceDetail({ id, collection, onVersion, onChanged, onClose }: { id: string; collection: ResearchCollection; onVersion: (source: ResearchFile) => void; onChanged: () => Promise<void>; onClose: () => void }) {
  const read = useResearchRead((signal) => researchApi("researchFile", { params: { id }, signal }), `library-source:${id}`);
  const [version, setVersion] = useState<number>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const operation = usePersonalOperation(true, `source-detail:${id}`);
  const { modal } = App.useApp();
  const data = read.data?.data, source = data?.file, selectedVersion = data?.versions.find(v => v.version === (version ?? source?.version));
  const withdraw = async () => {
    if (!source || busy) return;
    const { isCurrent } = operation.capture(); setBusy(true); setError("");
    try { await researchApi("withdrawResearchFile", { params: { id }, body: { expectedVersion: source.version } }); if (!isCurrent()) return; await onChanged(); if (isCurrent()) onClose(); }
    catch (error) { if (isCurrent()) { setError(failureText(error)); await read.refresh(); } }
    finally { if (isCurrent()) setBusy(false); }
  };
  return <aside className="research-source-detail" aria-label="来源与版本">
    <div className="research-library-subheading"><h3>来源与版本</h3><Button type="text" onClick={onClose}>收起</Button></div>
    {(read.error || error) && <Alert type="warning" message={error || read.error} action={<Button onClick={read.refresh}>重新读取</Button>} />}
    {!data && !read.error && <p role="status">正在读取来源…</p>}
    {source && selectedVersion && <>
      <h4><FileTextOutlined /> {selectedVersion.filename}</h4>
      <Select aria-label="来源版本" value={selectedVersion.version} options={data?.versions.map(v => ({ value: v.version, label: `v${v.version}${v.version === source.version ? " · 当前版本" : ""}` }))} onChange={setVersion} />
      <dl className="research-source-facts"><div><dt>资料范围</dt><dd>{researchScopeLabels[collection.scope]}</dd></div><div><dt>导入时间</dt><dd>{new Date(selectedVersion.createdAt).toLocaleString("zh-CN")}</dd></div><div><dt>原件大小</dt><dd>{(selectedVersion.byteLength / 1024).toFixed(1)} KiB</dd></div><div><dt>SHA256</dt><dd className="research-source-hash">{selectedVersion.sha256}</dd></div></dl>
      <ResearchFileDownload id={id} version={selectedVersion} disabled={busy || source.status !== "available" || collection.status !== "available"} />
      {source.owned && <Button icon={<UploadOutlined />} disabled={busy} onClick={() => onVersion(source)}>导入新版本</Button>}
      <section><h3>基本信息</h3><dl className="research-source-facts"><div><dt>标题</dt><dd>{selectedVersion.metadata.title || "未填写"}</dd></div><div><dt>作者</dt><dd>{selectedVersion.metadata.authors.join("、") || "未填写"}</dd></div><div><dt>年份 / DOI</dt><dd>{[selectedVersion.metadata.year, selectedVersion.metadata.doi].filter(Boolean).join(" / ") || "未填写"}</dd></div><div><dt>标签</dt><dd>{selectedVersion.metadata.tags.join("、") || "未填写"}</dd></div><div><dt>备注</dt><dd>{selectedVersion.metadata.note || "未填写"}</dd></div></dl></section>
      <section><h3>实际读取范围</h3><p>{selectedVersion.extraction === "text_extracted" ? `已提取 ${selectedVersion.pageCount} 页 / ${selectedVersion.characterCount} 字符。检索结果只引用实际提取片段。` : selectedVersion.extraction === "original_only" ? "仅保存原始文件，未提取文字或执行内容。" : "文字提取未完成，原始文件仍可下载。"}</p>{selectedVersion.extractionReason && <p className="research-library-muted">{selectedVersion.extractionReason}</p>}{selectedVersion.version === source.version && data?.preview.map((excerpt, index) => <div key={index}><p className="research-library-muted">第 {excerpt.citation.pageNumber} 页 · 字符 {excerpt.citation.start}–{excerpt.citation.end} · v{excerpt.citation.version}</p><pre className="research-source-preview">{excerpt.text}</pre></div>)}{selectedVersion.version !== source.version && <p className="research-library-muted">历史版本可下载原件；当前预览仅展示最新版本。</p>}</section>
      {source.owned && <Button danger disabled={busy} onClick={() => modal.confirm({ title: "撤回此来源？", content: "后续检索与 Agent 使用将停止读取此来源。", onOk: withdraw })}>撤回来源</Button>}
    </>}
  </aside>;
}

function LibraryBody() {
  const [params] = useSearchParams();
  const linkedCollection = params.get('collection'), linkedFile = params.get('file');
  const [feishuOpen, setFeishuOpen] = useState(false);
  const [feishuLibraryRead,setFeishuLibraryRead]=useState(false);
  const [chatFocus, setChatFocus] = useState(0);
  const [chatCollectionId,setChatCollectionId]=useState<string>();
  const [zoteroId, setZoteroId] = useState<string>();
  const [scope, setScope] = useState<"mine" | "visible" | "lab">("visible"), [collectionSearch, setCollectionSearch] = useState(""), [selectedId, setSelectedId] = useState<string>(), [sourceId, setSourceId] = useState<string>(), [search, setSearch] = useState(""), [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ResearchCollection | "new">(), [importing, setImporting] = useState<{ collection: ResearchCollection; source?: ResearchFile }>();
  const collections = useResearchRead((signal) => researchApi("researchCollections", { query: { scope: scope === "mine" ? "mine" : "visible", q: collectionSearch, limit: 100 }, signal }), `library-collections:${scope}:${collectionSearch}`);
  const shownCollections = collections.data?.data.filter(c => scope !== "lab" || c.scope === "lab_shared");
  const collection = shownCollections?.find(c => c.id === selectedId) ?? (!selectedId ? shownCollections?.[0] : undefined);
  const files = useResearchRead((signal) => researchApi("researchFiles", { params: { id: collection!.id }, query: { limit: 100 }, signal }), `library-files:${collection?.id}`, !!collection && !collection.externalSource);
  const matches = useResearchRead((signal) => researchApi("researchLibrarySearch", { query: { q: query, collectionId: collection!.id, limit: 20 }, signal }), `library-search:${collection?.id}:${query}`, !!collection && !!query);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (linkedCollection) { setScope('visible'); setCollectionSearch(''); setSelectedId(linkedCollection); setSourceId(linkedFile || undefined); setQuery(''); }
  }, [linkedCollection, linkedFile]);
  const operation = usePersonalOperation(true, "library-body"); const { modal } = App.useApp();
  const refresh = async () => { await Promise.all([collections.refresh(), files.refresh(), matches.refresh()]); };
  const refreshAfterImport = async () => { await Promise.all([collections.refreshChecked(), files.refreshChecked(), matches.refreshChecked()]); };
  const withdraw = async () => {
    if (!collection) return; const { isCurrent } = operation.capture(); setFailure("");
    try { await researchApi("withdrawResearchCollection", { params: { id: collection.id }, body: { expectedVersion: collection.version } }); if (!isCurrent()) return; setSelectedId(undefined); setSourceId(undefined); await collections.refresh(); }
    catch (error) { if (isCurrent()) { setFailure(failureText(error)); await collections.refresh(); } }
  };
  return <div className="research-library">
    <header className="research-library-heading"><div><h2>{params.get("panel") === "collections" ? "共享原件" : "资料库"}</h2><p>按集合保存原件与版本，读取范围由集合权限决定。</p></div><div className="research-library-actions"><Button onClick={() => setFeishuOpen(true)}>连接飞书资料</Button>{Boolean(shownCollections?.length) && <Button type="primary" onClick={() => setEditing("new")}>新建集合</Button>}</div></header>
    {failure && <Alert type="warning" message={failure} />}
    <div className={`research-library-body ${sourceId ? "has-source" : ""} ${shownCollections && !shownCollections.length ? "is-empty" : ""}`}>
      <aside className="research-collection-rail" aria-label="资料集合">
        <Segmented aria-label="集合范围" value={scope} options={[{ label: "全部", value: "visible" }, { label: "课题组", value: "lab" }, { label: "我的", value: "mine" }]} onChange={v => { setScope(v as typeof scope); setSelectedId(undefined); setSourceId(undefined); }} />
        <Input.Search aria-label="搜索资料集合" placeholder="搜索集合" onSearch={setCollectionSearch} allowClear />
        {collections.error && <Alert type="warning" message={collections.error} action={<Button onClick={collections.refresh}>重试</Button>} />}
        {!collections.data && !collections.error && <p role="status">正在读取集合…</p>}
        {shownCollections?.map(c => <button className="research-collection-row" key={c.id} aria-pressed={collection?.id === c.id} onClick={() => { setSelectedId(c.id); setSourceId(undefined); setQuery(""); setSearch(""); }}><FolderOutlined /><span><strong>{c.name}</strong><small>{researchScopeLabels[c.scope]} · {c.externalSource ? '飞书实时资料库' : `${c.fileCount} 份来源`}</small></span></button>)}
      </aside>
      <section className="research-file-list" aria-label="集合文件">
        {collection ? <>
          <div className="research-library-subheading"><div><h3>{collection.name}</h3></div>{collection.owned && <Button onClick={() => setEditing(collection)}>集合设置</Button>}</div>
          {collection.externalSource ? <FeishuLibrarySource id={collection.id} scope={collection.scope} onAsk={()=>{setChatCollectionId(collection.id);setChatFocus(n=>n+1);}}/> : <>
          <div className="research-library-actions">{collection.owned && <Button type="primary" icon={<UploadOutlined />} onClick={() => setImporting({ collection })}>导入文件</Button>}{collection.owned && collection.scope === "owner_private" && <Button onClick={() => setZoteroId(collection.id)}>从 Zotero 选择</Button>}<Input.Search aria-label="检索资料正文" placeholder="检索实际提取文字" value={search} allowClear onChange={e => setSearch(e.target.value)} onSearch={v => setQuery(v.trim())} /></div>
          {(files.error || matches.error) && <Alert type="warning" message={files.error || matches.error} action={<Button onClick={() => { void files.refresh(); void matches.refresh(); }}>重试</Button>} />}
          {query ? <div className="research-search-results">{matches.loading && <p role="status">正在检索…</p>}{matches.data?.data.map((match, i) => <button key={`${match.citation.sourceId}:${match.citation.version}:${match.citation.pageNumber}:${i}`} onClick={() => setSourceId(match.citation.sourceId)}><strong>{match.filename}</strong><small>v{match.citation.version} · 第 {match.citation.pageNumber} 页 · 字符 {match.citation.start}–{match.citation.end}</small><p>{match.text}</p>{match.partial && <small>此处为实际提取页的局部片段</small>}</button>)}{matches.data && !matches.data.data.length && <div className="research-library-empty"><h3>未找到实际文字片段</h3><p>调整关键词；仅保存原件的素材不会产生文字检索结果。</p></div>}<Button onClick={() => { setQuery(""); setSearch(""); }}>返回文件列表</Button></div> : <>
            <div className="research-file-table" role="table" aria-label="来源列表"><div className="research-file-table-head" role="row"><span>来源</span><span>状态</span><span>版本</span></div>{files.data?.data.map(file => <button role="row" aria-label={file.filename} aria-pressed={file.id === sourceId} key={file.id} onClick={() => setSourceId(file.id)}><span><FileTextOutlined />{file.filename}</span><span>{file.extraction === "text_extracted" ? "已提取文字" : file.extraction === "original_only" ? "原件" : "提取失败"}</span><span>v{file.version}</span></button>)}</div>
            {files.loading && !files.data && <p role="status">正在读取来源…</p>}{files.data && !files.data.data.length && <div className="research-library-empty"><h3>集合中尚无来源</h3><p>{collection.owned ? "从上方导入文件，保留原件与版本。" : "集合所有者尚未导入可用资料。"}</p></div>}
          </>}
          </>}
          {collection.owned && <div className="research-library-withdraw"><Button type="text" danger onClick={() => modal.confirm({ title: "撤回此资料集合？", content: "后续查询将停止使用此集合，飞书原表保持。", onOk: withdraw })}>撤回集合</Button></div>}
        </> : collections.error ? <div className="research-library-empty"><h3>暂时无法读取集合</h3><p>请重试读取后再选择或新建集合。</p><Button onClick={collections.refresh}>重新读取</Button></div> : !collections.data ? <p role="status">正在读取集合…</p> : shownCollections?.length === 0 ? <div className="research-library-empty"><FolderOutlined /><h3>{collectionSearch ? "没有匹配的资料集合" : scope === "lab" ? "暂无课题组共享集合" : "还没有资料集合"}</h3><p>{collectionSearch ? "换个名称搜索，或新建一个集合。" : scope === "lab" ? "新建集合并选择课题组共享，再导入原件。" : "新建集合，再导入论文、笔记或素材。"}</p><Button type="primary" onClick={() => setEditing("new")}>新建资料集合</Button></div> : <div className="research-library-empty"><h3>选择资料集合</h3><p>查看原件、版本与检索结果。</p></div>}
      </section>
      {sourceId && collection && <SourceDetail key={sourceId} id={sourceId} collection={collection} onClose={() => setSourceId(undefined)} onChanged={refresh} onVersion={source => setImporting({ collection, source })} />}
    </div>
    <LibraryAgent onConnectFeishu={() => {setFeishuLibraryRead(true);setFeishuOpen(true);}} focusRequest={chatFocus} queryCollectionId={chatCollectionId} visibleCollections={collections.data?.data} onLibraryBound={async id=>{await collections.refreshChecked();setSelectedId(id);setChatCollectionId(id);setSourceId(undefined);setQuery('');}} />
    {feishuOpen && <FeishuImport libraryRead={feishuLibraryRead} collectionId={collection?.owned && collection.scope === "owner_private" && !collection.externalSource ? collection.id : undefined} onClose={() => {setFeishuOpen(false);setFeishuLibraryRead(false);}} onSaved={refreshAfterImport} onChat={() => { setFeishuOpen(false); setFeishuLibraryRead(false);setChatFocus(n => n + 1); }} />}
    {zoteroId && collection?.id === zoteroId && collection.owned && collection.scope === "owner_private" && <ZoteroImport key={zoteroId} collection={collection} onClose={() => setZoteroId(undefined)} onSaved={refresh} />}
    {editing && <CollectionEditor key={editing === "new" ? "new" : editing.id} collection={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} onSaved={refresh} />}
    {importing && <FileImport key={`${importing.collection.id}:${importing.source?.id || "new"}`} {...importing} onClose={() => setImporting(undefined)} onSaved={refreshAfterImport} />}
  </div>;
}

function LibraryGate() {
  const read = useResearchRead(libraryAvailability, "research-library-availability");
  const supported = useRef(false);
  if (read.data) supported.current = read.data.available;
  if (!supported.current) return <section className="research-library-empty" role="status"><h2>{!read.data && !read.error ? "正在检查资料服务…" : read.error ? "资料服务暂不可用" : "资料服务待升级"}</h2><p>{read.error || "课题组资料需要服务契约 0.24 或以上。"}</p><Button onClick={read.refresh}>重新检查</Button></section>;
  return <div className="research-library-gate">{read.error && <Alert type="warning" message={read.error} action={<Button onClick={read.refresh}>重新检查</Button>} />}<LibraryBody /></div>;
}
export function ResearchLibrary() {
  const generation = useResearchStore(s => s.generation);
  return <LibraryGate key={generation} />;
}
