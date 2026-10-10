import { Alert, App, Button, Input, Modal, Select, Segmented } from "antd";
import { FileTextOutlined, FolderOutlined, UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import { useRef, useState } from "react";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { researchApi, ResearchApiError } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { workspaceAvailability } from "./workspace-availability";
import { withRequestDeadline } from "./request-deadline";
import { fileAsBase64, readResearchFileBytes, researchFileMediaType, researchScopeLabels } from "./research-library-api";
import "./research-library.scss";
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
  const tasks = useResearchRead((signal) => researchApi("workbench", { query: { category: "all", limit: 100 }, signal }), "library-task-options", scope === "task_scoped");
  const { modal } = App.useApp();
  const save = async () => {
    if (!name.trim() || busy || (scope === "task_scoped" && !taskIds.length)) return;
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
      <label>资料范围<Select aria-label="资料范围" options={scopeOptions} value={scope} disabled={busy} onChange={setScope} /></label>
      {scope === "task_scoped" && <label>获准任务<Select mode="multiple" aria-label="资料授权任务" value={taskIds} disabled={busy || !tasks.data} onChange={setTaskIds} options={tasks.data?.data.filter(c => c.taskId && !c.summaryOnly && c.source === "research_task").map(c => ({ value: c.taskId!, label: c.title }))} />{tasks.error && <Alert type="warning" message={tasks.error} action={<Button onClick={tasks.refresh}>重试</Button>} />}<small>仅本页可完整查看的科研任务；没有可选任务时，可先保存为仅自己。</small></label>}
      <p className="research-library-muted">{scope === "public" ? "公开集合会让注册用户读取原始资料，请确认材料可公开。" : scope === "lab_shared" ? "课题组当前成员可读取资料，成员变化后使用时会重新核对权限。" : scope === "task_scoped" ? "仅获准完整查看所选科研任务的人可读取。" : "仅你本人可读取，不随 Agent 名片公开。"}</p>
      {error && <Alert type="error" message={error} />}
      <Button type="primary" loading={busy} disabled={!name.trim() || (scope === "task_scoped" && !taskIds.length)} onClick={() => scope === "public" && collection?.scope !== "public" ? modal.confirm({ title: "公开此集合的资料？", content: "其他注册用户将可读取与下载集合中的原始资料。", onOk: save }) : void save()}>保存集合</Button>
    </div>
  </Modal>;
}

function FileImport({ collection, source, onClose, onSaved }: { collection: ResearchCollection; source?: ResearchFile; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File>(), [title, setTitle] = useState(source?.metadata.title || ""), [authors, setAuthors] = useState(source?.metadata.authors.join("，") || ""), [tags, setTags] = useState(source?.metadata.tags.join("，") || ""), [note, setNote] = useState(source?.metadata.note || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const operation = usePersonalOperation(true, `file-import:${collection.id}:${source?.id || "new"}`);
  const collectionVersion = useRef(collection.version), sourceVersion = useRef(source?.version);
  const split = (text: string) => text.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  const submit = async () => {
    if (!file || busy) return;
    const { isCurrent } = operation.capture(); setBusy(true); setError("");
    try {
      const contentBase64 = await fileAsBase64(file); if (!isCurrent()) return;
      await researchApi("importResearchFile", { params: { id: collection.id }, body: { expectedCollectionVersion: collectionVersion.current, filename: file.name, mediaType: researchFileMediaType(file), contentBase64, metadata: { title, authors: split(authors), tags: split(tags), note, year: source?.metadata.year ?? null, doi: source?.metadata.doi ?? null }, ...(source ? { fileId: source.id, expectedVersion: sourceVersion.current } : {}) } });
      if (!isCurrent()) return; await onSaved(); if (isCurrent()) onClose();
    } catch (error) {
      if (isCurrent()) {
        setError(failureText(error));
        // A successful re-read resolves a stale version without discarding file or metadata drafts.
        if (error instanceof ResearchApiError && error.code === "VERSION_CONFLICT") try {
          const values = await Promise.all([researchApi("researchCollections", { query: { scope: "mine", limit: 100 } }), source ? researchApi("researchFile", { params: { id: source.id } }) : Promise.resolve(undefined)]);
          if (isCurrent()) { collectionVersion.current = values[0].data.find(c => c.id === collection.id)?.version ?? collectionVersion.current; sourceVersion.current = values[1]?.data.file.version ?? sourceVersion.current; }
        } catch { /* Keep original request retryable after network errors. */ }
      }
    } finally { if (isCurrent()) setBusy(false); }
  };
  return <Modal title={source ? "导入新版本" : "导入资料与素材"} open footer={null} onCancel={() => !busy && onClose()} maskClosable={!busy} closable={!busy}>
    <div className="research-library-form">
      <p>保存到“{collection.name}” · {researchScopeLabels[collection.scope]}。每份文件不超过 10 MiB。</p>
      <label>原始文件<input type="file" aria-label="导入原始文件" disabled={busy} onChange={e => setFile(e.target.files?.[0])} /></label>
      <p className="research-library-muted">含文字 PDF、TXT、Markdown、CSV 可提取文字；图片、代码与其他素材保存原件，不执行脚本或声称理解图像。</p>
      <label>标题<Input aria-label="资料标题" maxLength={500} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
      <label>作者<Input aria-label="资料作者" value={authors} disabled={busy} onChange={e => setAuthors(e.target.value)} placeholder="用逗号分隔" /></label>
      <label>标签<Input aria-label="资料标签" value={tags} disabled={busy} onChange={e => setTags(e.target.value)} placeholder="用逗号分隔" /></label>
      <label>备注<Input.TextArea aria-label="资料备注" rows={3} maxLength={4000} value={note} disabled={busy} onChange={e => setNote(e.target.value)} /></label>
      {error && <Alert type="error" message={error} />}
      <Button type="primary" disabled={!file} loading={busy} onClick={() => void submit()}>{error ? "重试导入" : "确认导入"}</Button>
    </div>
  </Modal>;
}

function SourceDetail({ id, collection, onVersion, onChanged, onClose }: { id: string; collection: ResearchCollection; onVersion: (source: ResearchFile) => void; onChanged: () => Promise<void>; onClose: () => void }) {
  const read = useResearchRead((signal) => researchApi("researchFile", { params: { id }, signal }), `library-source:${id}`);
  const [version, setVersion] = useState<number>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const operation = usePersonalOperation(true, `source-detail:${id}`);
  const { modal } = App.useApp();
  const data = read.data?.data, source = data?.file, selectedVersion = data?.versions.find(v => v.version === (version ?? source?.version));
  const download = async () => {
    if (!source || !selectedVersion || busy) return;
    const { isCurrent } = operation.capture(); setBusy(true); setError("");
    try {
      const blob = await readResearchFileBytes(id, selectedVersion.version); if (!isCurrent()) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = selectedVersion.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) { if (isCurrent()) setError(failureText(error)); }
    finally { if (isCurrent()) setBusy(false); }
  };
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
      <div className="research-library-actions"><Button icon={<DownloadOutlined />} type="primary" loading={busy} onClick={() => void download()}>下载原始文件</Button>{source.owned && <Button icon={<UploadOutlined />} disabled={busy} onClick={() => onVersion(source)}>导入新版本</Button>}</div>
      <section><h3>基本信息</h3><dl className="research-source-facts"><div><dt>标题</dt><dd>{selectedVersion.metadata.title || "未填写"}</dd></div><div><dt>作者</dt><dd>{selectedVersion.metadata.authors.join("、") || "未填写"}</dd></div><div><dt>年份 / DOI</dt><dd>{[selectedVersion.metadata.year, selectedVersion.metadata.doi].filter(Boolean).join(" / ") || "未填写"}</dd></div><div><dt>标签</dt><dd>{selectedVersion.metadata.tags.join("、") || "未填写"}</dd></div><div><dt>备注</dt><dd>{selectedVersion.metadata.note || "未填写"}</dd></div></dl></section>
      <section><h3>实际读取范围</h3><p>{selectedVersion.extraction === "text_extracted" ? `已提取 ${selectedVersion.pageCount} 页 / ${selectedVersion.characterCount} 字符。检索结果只引用实际提取片段。` : selectedVersion.extraction === "original_only" ? "仅保存原始文件，未提取文字或执行内容。" : "文字提取未完成，原始文件仍可下载。"}</p>{selectedVersion.extractionReason && <p className="research-library-muted">{selectedVersion.extractionReason}</p>}{selectedVersion.version === source.version && data?.preview.map((excerpt, index) => <div key={index}><p className="research-library-muted">第 {excerpt.citation.pageNumber} 页 · 字符 {excerpt.citation.start}–{excerpt.citation.end} · v{excerpt.citation.version}</p><pre className="research-source-preview">{excerpt.text}</pre></div>)}{selectedVersion.version !== source.version && <p className="research-library-muted">历史版本可下载原件；当前预览仅展示最新版本。</p>}</section>
      {source.owned && <Button danger disabled={busy} onClick={() => modal.confirm({ title: "撤回此来源？", content: "后续检索与 Agent 使用将停止读取此来源。", onOk: withdraw })}>撤回来源</Button>}
    </>}
  </aside>;
}

function LibraryBody() {
  const [scope, setScope] = useState<"mine" | "visible">("visible"), [collectionSearch, setCollectionSearch] = useState(""), [selectedId, setSelectedId] = useState<string>(), [sourceId, setSourceId] = useState<string>(), [search, setSearch] = useState(""), [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ResearchCollection | "new">(), [importing, setImporting] = useState<{ collection: ResearchCollection; source?: ResearchFile }>();
  const collections = useResearchRead((signal) => researchApi("researchCollections", { query: { scope, q: collectionSearch, limit: 100 }, signal }), `library-collections:${scope}:${collectionSearch}`);
  const collection = collections.data?.data.find(c => c.id === selectedId) ?? (!selectedId ? collections.data?.data[0] : undefined);
  const files = useResearchRead((signal) => researchApi("researchFiles", { params: { id: collection!.id }, query: { limit: 100 }, signal }), `library-files:${collection?.id}`, !!collection);
  const matches = useResearchRead((signal) => researchApi("researchLibrarySearch", { query: { q: query, collectionId: collection!.id, limit: 20 }, signal }), `library-search:${collection?.id}:${query}`, !!collection && !!query);
  const [failure, setFailure] = useState("");
  const operation = usePersonalOperation(true, "library-body"); const { modal } = App.useApp();
  const refresh = async () => { await Promise.all([collections.refresh(), files.refresh(), matches.refresh()]); };
  const withdraw = async () => {
    if (!collection) return; const { isCurrent } = operation.capture(); setFailure("");
    try { await researchApi("withdrawResearchCollection", { params: { id: collection.id }, body: { expectedVersion: collection.version } }); if (!isCurrent()) return; setSelectedId(undefined); setSourceId(undefined); await collections.refresh(); }
    catch (error) { if (isCurrent()) { setFailure(failureText(error)); await collections.refresh(); } }
  };
  return <div className="research-library">
    <header className="research-library-heading"><div><h2>资料与素材库</h2><p>只使用当前账号获准的资料，公开 Agent 不会公开私人资料。</p></div><Button type="primary" onClick={() => setEditing("new")}>新建集合</Button></header>
    {failure && <Alert type="warning" message={failure} />}
    <div className={`research-library-body ${sourceId ? "has-source" : ""}`}>
      <aside className="research-collection-rail" aria-label="资料集合">
        <Segmented aria-label="集合范围" value={scope} options={[{ label: "获准资料", value: "visible" }, { label: "我的集合", value: "mine" }]} onChange={v => { setScope(v as typeof scope); setSelectedId(undefined); setSourceId(undefined); }} />
        <Input.Search aria-label="搜索资料集合" placeholder="搜索集合" onSearch={setCollectionSearch} allowClear />
        {collections.error && <Alert type="warning" message={collections.error} action={<Button onClick={collections.refresh}>重试</Button>} />}
        {!collections.data && !collections.error && <p role="status">正在读取集合…</p>}
        {collections.data?.data.map(c => <button className="research-collection-row" key={c.id} aria-pressed={collection?.id === c.id} onClick={() => { setSelectedId(c.id); setSourceId(undefined); setQuery(""); setSearch(""); }}><FolderOutlined /><span><strong>{c.name}</strong><small>{researchScopeLabels[c.scope]} · {c.fileCount} 份来源</small></span></button>)}
        {collections.data && !collections.data.data.length && <div className="research-library-empty"><h3>暂无资料集合</h3><p>新建集合后，导入论文、笔记与素材。</p></div>}
      </aside>
      <section className="research-file-list" aria-label="集合文件">
        {collection ? <>
          <div className="research-library-subheading"><div><h3>{collection.name}</h3><p>{collection.description || researchScopeLabels[collection.scope]}</p></div>{collection.owned && <Button onClick={() => setEditing(collection)}>集合设置</Button>}</div>
          <div className="research-library-actions">{collection.owned && <Button type="primary" icon={<UploadOutlined />} onClick={() => setImporting({ collection })}>导入文件</Button>}<Input.Search aria-label="检索资料正文" placeholder="检索实际提取文字" value={search} allowClear onChange={e => setSearch(e.target.value)} onSearch={v => setQuery(v.trim())} /></div>
          {(files.error || matches.error) && <Alert type="warning" message={files.error || matches.error} action={<Button onClick={() => { void files.refresh(); void matches.refresh(); }}>重试</Button>} />}
          {query ? <div className="research-search-results">{matches.loading && <p role="status">正在检索…</p>}{matches.data?.data.map((match, i) => <button key={`${match.citation.sourceId}:${match.citation.version}:${match.citation.pageNumber}:${i}`} onClick={() => setSourceId(match.citation.sourceId)}><strong>{match.filename}</strong><small>v{match.citation.version} · 第 {match.citation.pageNumber} 页 · 字符 {match.citation.start}–{match.citation.end}</small><p>{match.text}</p>{match.partial && <small>此处为实际提取页的局部片段</small>}</button>)}{matches.data && !matches.data.data.length && <div className="research-library-empty"><h3>未找到实际文字片段</h3><p>调整关键词；仅保存原件的素材不会产生文字检索结果。</p></div>}<Button onClick={() => { setQuery(""); setSearch(""); }}>返回文件列表</Button></div> : <>
            <div className="research-file-table" role="table" aria-label="来源列表"><div className="research-file-table-head" role="row"><span>来源</span><span>状态</span><span>版本</span></div>{files.data?.data.map(file => <button role="row" aria-label={file.filename} aria-pressed={file.id === sourceId} key={file.id} onClick={() => setSourceId(file.id)}><span><FileTextOutlined />{file.filename}</span><span>{file.extraction === "text_extracted" ? "已提取文字" : file.extraction === "original_only" ? "原件" : "提取失败"}</span><span>v{file.version}</span></button>)}</div>
            {files.loading && !files.data && <p role="status">正在读取来源…</p>}{files.data && !files.data.data.length && <div className="research-library-empty"><h3>集合中尚无来源</h3><p>{collection.owned ? "导入文件，保留原件与版本，再检索实际文字。" : "集合所有者尚未导入可用资料。"}</p></div>}
          </>}
          {collection.owned && <div className="research-library-withdraw"><Button type="text" danger onClick={() => modal.confirm({ title: "撤回此资料集合？", content: "其他成员与 Agent 后续将无法使用此集合。", onOk: withdraw })}>撤回集合</Button></div>}
        </> : <div className="research-library-empty"><h3>选择资料集合</h3><p>集合范围决定谁可以读取资料。</p></div>}
      </section>
      {sourceId && collection && <SourceDetail key={sourceId} id={sourceId} collection={collection} onClose={() => setSourceId(undefined)} onChanged={refresh} onVersion={source => setImporting({ collection, source })} />}
    </div>
    {editing && <CollectionEditor key={editing === "new" ? "new" : editing.id} collection={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} onSaved={refresh} />}
    {importing && <FileImport key={`${importing.collection.id}:${importing.source?.id || "new"}`} {...importing} onClose={() => setImporting(undefined)} onSaved={refresh} />}
  </div>;
}

function LibraryGate() {
  const read = useResearchRead(libraryAvailability, "research-library-availability");
  const supported = useRef(false);
  if (read.data) supported.current = read.data.available;
  if (!supported.current) return <section className="research-library-empty" role="status"><h2>{!read.data && !read.error ? "正在检查资料服务…" : read.error ? "资料服务暂不可用" : "资料服务待升级"}</h2><p>{read.error || "资料与素材库需要服务契约 0.24 或以上。"}</p><Button onClick={read.refresh}>重新检查</Button></section>;
  return <div className="research-library-gate">{read.error && <Alert type="warning" message={read.error} action={<Button onClick={read.refresh}>重新检查</Button>} />}<LibraryBody /></div>;
}
export function ResearchLibrary() {
  const generation = useResearchStore(s => s.generation);
  return <LibraryGate key={generation} />;
}
