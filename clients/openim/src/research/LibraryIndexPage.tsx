import "./library-index.scss";

import type { LibraryIndexEntry } from "@research-agent-platform/contracts";
import { Alert, Button, Checkbox, Input, Select, Tag } from "antd";
import { useState } from "react";

import { researchApi } from "./api";
import { LocalLibraryPicker } from "./LocalLibraryPicker";
import { useResearchStore } from "./store";
import { useLocalLibrary } from "./useLocalLibrary";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";

const purposeLabels = {
  master: "母版/模板",
  reference: "参考样例",
  evidence: "事实依据",
  figure: "图与素材",
  other: "其他",
} as const;

type Purpose = LibraryIndexEntry["purpose"];

type Draft = {
  id?: string;
  version: number;
  project: string;
  name: string;
  relPath: string;
  purpose: Purpose;
  summary: string;
  sha256: string | null;
  recommended: boolean;
};

type Check = "same" | "different" | "missing";

/**
 * The lab's files stay on disk. This page keeps the pointer list: which file,
 * where it lives inside the shared folder, what it is for, and who keeps it
 * current. Nothing here uploads an original.
 */
export function LibraryIndexPage() {
  const availability = useWorkspaceAvailability(true);
  const supported = availability.supports(41);
  const actor = useResearchStore((s) => s.actor);
  const operation = usePersonalOperation(supported, "library-index");
  const read = useResearchRead(
    () => researchApi("libraryIndex"),
    "library-index",
    supported && Boolean(actor),
  );
  const local = useLocalLibrary();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const entries = read.data?.data.entries || [];
  const visible = entries.filter(
    (entry) =>
      !query.trim() ||
      [entry.name, entry.project, entry.summary].some((value) =>
        value.toLowerCase().includes(query.trim().toLowerCase()),
      ),
  );
  const projects = [...new Set(visible.map((entry) => entry.project))].sort();
  const bridge = window.electronAPI?.localLibrary;
  const save = async (action: "save" | "revoke", entry?: LibraryIndexEntry) => {
    const source = entry
      ? {
          id: entry.id,
          version: entry.version,
          project: entry.project,
          name: entry.name,
          relPath: entry.relPath,
          purpose: entry.purpose,
          summary: entry.summary,
          sha256: entry.sha256,
          recommended: entry.recommended,
        }
      : draft;
    if (!source) return;
    const captured = operation.capture();
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      await researchApi("saveLibraryIndexEntry", {
        body: {
          project: source.project.trim(),
          name: source.name.trim(),
          relPath: source.relPath.trim(),
          purpose: source.purpose,
          summary: source.summary.trim(),
          sha256: source.sha256,
          recommended: source.recommended,
          recordId: source.id ?? null,
          expectedVersion: source.version,
          action,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      if (!captured.isCurrent()) return;
      setDraft(undefined);
      setNotice(
        action === "revoke" ? "已撤回这条索引。" : "已保存，全组都能看到这条索引。",
      );
      await read.refresh();
      await local.refresh();
    } catch (e) {
      if (captured.isCurrent())
        setFailure(e instanceof Error ? e.message : "没有保存成功，填写内容已保留。");
    } finally {
      if (captured.isCurrent()) setBusy(false);
    }
  };
  const check = async (entry: LibraryIndexEntry) => {
    if (!bridge) return;
    setBusy(true);
    setFailure("");
    try {
      const { sha256 } = await bridge.hash(entry.relPath);
      setChecks((value) => ({
        ...value,
        [entry.id]: !entry.sha256
          ? "same"
          : entry.sha256 === sha256
          ? "same"
          : "different",
      }));
    } catch {
      setChecks((value) => ({ ...value, [entry.id]: "missing" }));
    } finally {
      setBusy(false);
    }
  };
  if (!supported)
    return (
      <div className="library-workspace-content">
        <WorkspaceUnavailable
          feature="资料索引"
          pending={!availability.data && !availability.error}
          error={availability.error}
          onRetry={availability.refresh}
        />
      </div>
    );
  return (
    <section className="library-index" aria-label="资料索引">
      <div className="library-index-head">
        <div>
          <h2>我的资料</h2>
          <p>原件保留在本机，资料索引供课题组成员查阅。</p>
        </div>
        {!local.status?.registered ? (
          <Button
            type="primary"
            loading={local.busy}
            disabled={!bridge}
            onClick={() => void local.pick()}
          >
            选择资料文件夹
          </Button>
        ) : (
          <Button
            type="primary"
            disabled={busy}
            onClick={() =>
              setDraft({
                version: 0,
                project: projects[0] || "",
                name: "",
                relPath: "",
                purpose: "reference",
                summary: "",
                sha256: null,
                recommended: false,
              })
            }
          >
            新增索引
          </Button>
        )}
      </div>
      {local.status?.registered && (
        <div className="library-index-folder">
          {local.status?.registered ? (
            <span>
              本地文件夹：<strong>{local.status.name}</strong>
              {local.manifest
                ? `（${local.manifest.files.length} 个可用文件）`
                : "（现在打不开）"}
            </span>
          ) : (
            <span>还没有登记本地资料文件夹，先选一个再新增索引。</span>
          )}
          <Button size="small" loading={local.busy} onClick={() => void local.pick()}>
            {local.status?.registered ? "更换文件夹" : "选择文件夹"}
          </Button>
        </div>
      )}
      {entries.length > 0 && (
        <Input.Search
          aria-label="搜索资料索引"
          placeholder="搜索文件名、项目或用途说明"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
      )}
      {!bridge && <p>请在 Windows 桌面客户端选择本地资料文件夹。</p>}
      {(failure || local.failure) && (
        <Alert type="error" message={failure || local.failure} />
      )}
      {notice && <Alert type="success" message={notice} />}
      {read.error && (
        <Alert
          type="error"
          message="资料索引暂不可用"
          description={read.error}
          action={<Button onClick={read.refresh}>重试读取</Button>}
        />
      )}
      {!read.data && !read.error && <p role="status">正在读取索引…</p>}
      {read.data && !entries.length && (
        <p className="library-index-empty">
          {local.status?.registered
            ? "还没有资料索引。新增一条，记录文件用途和位置。"
            : "先选择存放资料的文件夹，再登记常用文件。原件不会上传。"}
        </p>
      )}
      {!!entries.length && !visible.length && (
        <p className="library-index-empty">没有符合条件的资料索引。</p>
      )}
      {projects.map((project) => (
        <section key={project} className="library-index-group" aria-label={project}>
          <h3>
            {project} · {visible.filter((entry) => entry.project === project).length}
          </h3>
          {visible
            .filter((entry) => entry.project === project)
            .map((entry) => {
              const checkState = checks[entry.id];
              const present = local.present.has(entry.relPath);
              return (
                <article key={entry.id} className="library-index-row">
                  <header>
                    <strong>{entry.name}</strong>
                    <Tag bordered={false}>{purposeLabels[entry.purpose]}</Tag>
                    {entry.recommended && <Tag color="green">推荐使用</Tag>}
                    <span
                      className={
                        checkState === "different" || (!present && local.manifest)
                          ? "library-index-local is-missing"
                          : "library-index-local"
                      }
                    >
                      {checkState === "different"
                        ? "本地版本不同"
                        : checkState === "missing" || (!present && local.manifest)
                        ? "本地缺这份"
                        : checkState === "same"
                        ? "本地一致"
                        : present
                        ? "本地有"
                        : ""}
                    </span>
                  </header>
                  {entry.summary && <p>{entry.summary}</p>}
                  <small>
                    {entry.relPath} · 维护人 {entry.maintainerName} ·{" "}
                    {new Date(entry.updatedAt).toLocaleString("zh-CN")}
                  </small>
                  <div className="library-index-actions">
                    {entry.allowedActions.includes("revise") && (
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() =>
                          setDraft({
                            id: entry.id,
                            version: entry.version,
                            project: entry.project,
                            name: entry.name,
                            relPath: entry.relPath,
                            purpose: entry.purpose,
                            summary: entry.summary,
                            sha256: entry.sha256,
                            recommended: entry.recommended,
                          })
                        }
                      >
                        修改
                      </Button>
                    )}
                    {!entry.recommended && entry.allowedActions.includes("revise") && (
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() =>
                          void save("save", { ...entry, recommended: true })
                        }
                      >
                        设为推荐
                      </Button>
                    )}
                    {bridge && (
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() => void check(entry)}
                      >
                        校验本地版本
                      </Button>
                    )}
                    {entry.allowedActions.includes("revoke") && (
                      <Button
                        size="small"
                        danger
                        disabled={busy}
                        onClick={() => void save("revoke", entry)}
                      >
                        撤回
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
        </section>
      ))}
      {draft && (
        <div className="library-index-editor" aria-label="编辑资料索引">
          <div className="library-index-editor-row">
            <Input
              aria-label="项目"
              placeholder="项目，例如 2027 面上"
              maxLength={60}
              value={draft.project}
              disabled={busy}
              onChange={(e) => setDraft((s) => s && { ...s, project: e.target.value })}
            />
            <Select
              aria-label="用途"
              value={draft.purpose}
              disabled={busy}
              options={Object.entries(purposeLabels).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(purpose) => setDraft((s) => s && { ...s, purpose })}
            />
          </div>
          <div className="library-index-editor-row">
            <Input
              aria-label="文件名"
              placeholder="文件名"
              maxLength={200}
              value={draft.name}
              disabled={busy}
              onChange={(e) => setDraft((s) => s && { ...s, name: e.target.value })}
            />
            <Button
              disabled={busy || !local.status?.registered}
              onClick={() => setPicking(true)}
            >
              从本地资料文件夹选择
            </Button>
          </div>
          <Input
            aria-label="相对路径"
            placeholder="相对路径，例如 模板/组会母版.pptx"
            maxLength={600}
            value={draft.relPath}
            disabled={busy}
            onChange={(e) => setDraft((s) => s && { ...s, relPath: e.target.value })}
          />
          <Input.TextArea
            aria-label="摘要"
            rows={2}
            maxLength={300}
            placeholder="一句话说明：这份文件是什么、什么时候用"
            value={draft.summary}
            disabled={busy}
            onChange={(e) => setDraft((s) => s && { ...s, summary: e.target.value })}
          />
          <Checkbox
            checked={draft.recommended}
            disabled={busy}
            onChange={(e) =>
              setDraft((s) => s && { ...s, recommended: e.target.checked })
            }
          >
            同一项目、同一用途里推荐用这份
          </Checkbox>
          <div className="library-index-actions">
            <Button
              type="primary"
              loading={busy}
              disabled={
                !draft.project.trim() || !draft.name.trim() || !draft.relPath.trim()
              }
              onClick={() => void save("save")}
            >
              保存
            </Button>
            <Button disabled={busy} onClick={() => setDraft(undefined)}>
              取消
            </Button>
            {draft.sha256 && (
              <span className="library-index-hint">
                已记录内容哈希，别人可以校验“是不是同一份”。
              </span>
            )}
          </div>
        </div>
      )}
      <LocalLibraryPicker
        open={picking}
        confirmLabel="用这份文件"
        onClose={() => setPicking(false)}
        onPick={async (rels) => {
          setPicking(false);
          const rel = rels[0];
          if (!rel) return;
          const name = rel.split(/[\\/]/).pop() || rel;
          let sha256: string | null = null;
          try {
            sha256 = bridge ? (await bridge.hash(rel)).sha256 : null;
          } catch {
            /* A hash is optional; the pointer still works without it. */
          }
          setDraft((s) =>
            s
              ? {
                  ...s,
                  name,
                  relPath: rel,
                  sha256,
                  project: s.project || name,
                }
              : s,
          );
        }}
      />
    </section>
  );
}
