import { Alert, Button, Input, Modal, Select } from "antd";
import { useState } from "react";
import type { InstalledSkill } from "@research-agent-platform/contracts";
import type {
  SkillBundleLocator,
  SkillBundleManifest,
  SkillBundleFile,
} from "@research-agent-platform/research-skills/import";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";

export async function localSkillLocator(
  skill: InstalledSkill,
  memberId: string,
): Promise<SkillBundleLocator> {
  return {
    accountKey: memberId,
    skillId: skill.id,
    revision: skill.revision,
    digest: skill.digest,
  };
}

export function SkillMaterials({ skill }: { skill: InstalledSkill }) {
  const generation = useResearchStore((s) => s.generation),
    memberId = useResearchStore((s) => s.actor?.member.id);
  const read = useResearchRead(
    async () => {
      const locator = await localSkillLocator(skill, memberId!);
      return {
        locator,
        manifest: await window.electronAPI!.skillBundleManifest(locator),
      };
    },
    `skill-materials:${skill.id}:${skill.revision}:${skill.digest}`,
    !!skill.owned && !!memberId && !!window.electronAPI?.skillBundleManifest,
  );
  if (!skill.owned) return null;
  return (
    <section className="skill-materials">
      <h3>本机原件与素材</h3>
      {read.error && (
        <Alert
          type="error"
          message={read.error}
          action={<Button onClick={read.refresh}>重试</Button>}
        />
      )}
      {read.data?.manifest ? (
        <MaterialBrowser
          key={`${generation}:${skill.id}:${skill.revision}:${read.data.manifest.bundleDigest}`}
          locator={read.data.locator}
          manifest={read.data.manifest}
        />
      ) : (
        <p className="skill-muted">
          此修订尚无本机原件。旧版安装和授权文字副本只有说明；重新导入完整包后可浏览素材。本机原件不会随技能授权共享。
        </p>
      )}
    </section>
  );
}

function MaterialBrowser({
  locator,
  manifest,
}: {
  locator: SkillBundleLocator;
  manifest: SkillBundleManifest;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [page, setPage] = useState(0),
    [file, setFile] = useState<SkillBundleFile>(),
    [preview, setPreview] = useState<{ image?: string; text?: string }>(),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(false),
    [collectionId, setCollectionId] = useState<string>();
  const operation = usePersonalOperation(true, "skill-material-library");
  const collections = useResearchRead(
    (signal) =>
      researchApi("researchCollections", {
        query: { scope: "mine", limit: 100 },
        signal,
      }),
    "skill-material-upload-collections",
    upload,
  );
  const collection = collections.data?.data.find(
    (c) => c.id === collectionId && c.owned && c.status === "available",
  );
  const scopeNames = {
    owner_private: "仅自己",
    task_scoped: "任务授权",
    lab_shared: "课题组",
    public: "公开",
  };
  const files = manifest.files.filter(
    (f) =>
      (category === "all" || f.category === category) &&
      f.path.toLowerCase().includes(search.toLowerCase()),
  );
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    const { isCurrent } = operation.capture();
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (error) {
      if (isCurrent())
        setStatus(error instanceof Error ? error.message : "素材读取失败。");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  async function inspect(selected: SkillBundleFile) {
    setFile(selected);
    setPreview(undefined);
    await action(async () => {
      const result = await window.electronAPI!.readSkillBundleAsset(
        locator,
        selected.path,
      );
      if (/^image\/(png|jpeg|webp|gif)$/.test(result.mediaType))
        setPreview({ image: `data:${result.mediaType};base64,${result.base64}` });
      else if (
        result.mediaType.startsWith("text/") ||
        ["application/json", "image/svg+xml"].includes(result.mediaType)
      ) {
        const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        setPreview({ text: text.slice(0, 100000) });
        if (text.length > 100000)
          setStatus("预览仅显示前 100,000 字符，另存原件保留全文。");
      } else setStatus("此格式可另存原件；未接入内嵌预览。");
    });
  }
  async function save(relative: string) {
    await action(async () => {
      const result = await window.electronAPI!.saveSkillBundleAsset(locator, relative);
      setStatus(result.saved ? "原件已保存。" : "已取消另存。");
    });
  }
  async function addToLibrary() {
    if (!file || !collection || file.size > 10 * 1024 * 1024) return;
    const { isCurrent } = operation.capture();
    await action(async () => {
      const value = await window.electronAPI!.readSkillBundleAsset(locator, file.path);
      if (!isCurrent()) return;
      await researchApi("importResearchFile", {
        params: { id: collection.id },
        body: {
          filename: file.path.split("/").pop()!,
          mediaType: value.mediaType,
          contentBase64: value.base64,
          expectedCollectionVersion: collection.version,
          metadata: {
            title: "",
            authors: [],
            year: null,
            doi: null,
            tags: ["Skill素材"],
            note: `Skill原路径：${file.path}\n修订：${locator.revision}\nSHA256：${value.sha256}`,
          },
        },
      });
      if (!isCurrent()) return;
      setUpload(false);
      setStatus(`原件已保存到“${collection.name}”。`);
      await collections.refresh();
    });
  }
  return (
    <>
      <p>
        {manifest.files.length} 个原件 ·{" "}
        {(manifest.totalBytes / 1024 / 1024).toFixed(1)} MiB ·
        本机保存，未上传素材或执行脚本
      </p>
      <p className="skill-muted">
        资料位置：AcceptCat 用户数据目录 /
        private-skill-bundles。原路径由清单映射到校验过的原件；调用时不会自动把图片或脚本送给模型。
      </p>
      <div className="skill-actions">
        <Input
          aria-label="搜索技能原件路径"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="按原路径搜索素材"
        />
        <Select
          aria-label="素材分类"
          value={category}
          onChange={(v) => {
            setCategory(v);
            setPage(0);
          }}
          options={[
            { value: "all", label: "全部" },
            { value: "instruction", label: "说明" },
            { value: "reference", label: "参考资料" },
            { value: "asset", label: "图片与素材" },
            { value: "script", label: "脚本源码" },
            { value: "other", label: "其他原件" },
          ]}
        />
      </div>
      {manifest.originalZip && (
        <Button disabled={busy} onClick={() => void save("$original.zip")}>
          另存完整原 ZIP
        </Button>
      )}
      <div className="skill-material-paths">
        {files.slice(page * 40, (page + 1) * 40).map((f) => (
          <button
            key={f.path}
            disabled={busy}
            onClick={() => void inspect(f)}
            aria-pressed={file?.path === f.path}
          >
            <span>{f.path}</span>
            <small>
              {f.mediaType} · {f.size} 字节
            </small>
          </button>
        ))}
      </div>
      <div className="skill-actions">
        <Button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          上一页
        </Button>
        <span>
          {files.length ? page + 1 : 0} / {Math.ceil(files.length / 40)} ·{" "}
          {files.length} 项
        </span>
        <Button
          disabled={(page + 1) * 40 >= files.length}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
      {file && (
        <div className="skill-material-preview">
          <p>
            引用路径：<code>{file.path}</code>
          </p>
          <p className="skill-muted">SHA256：{file.sha256}</p>
          <div className="skill-actions">
            <Button disabled={busy} onClick={() => void save(file.path)}>
              另存原件
            </Button>
            <Button
              disabled={busy || !file.size || file.size > 10 * 1024 * 1024}
              onClick={() => {
                setUpload(true);
                setCollectionId(undefined);
              }}
            >
              加入科研资料库
            </Button>
          </div>
          {file.size > 10 * 1024 * 1024 && (
            <p>资料库单文件上限 10 MiB；此原件可另存。</p>
          )}
          {preview?.image && <img src={preview.image} alt={file.path} />}
          {preview?.text !== undefined && <pre>{preview.text}</pre>}
        </div>
      )}
      {status && <Alert type="info" message={status} />}
      <Modal
        open={upload}
        title="将选定原件加入科研资料库"
        onCancel={() => {
          if (!busy) setUpload(false);
        }}
        footer={
          <Button
            type="primary"
            loading={busy}
            disabled={!collection}
            onClick={() => void addToLibrary()}
          >
            确认上传此原件
          </Button>
        }
      >
        <p>
          {file?.path} · {file?.size}{" "}
          字节。此操作将选定原件发送到科研服务器，仅保存原始素材，不执行脚本或表示已理解图像。
        </p>
        {collections.error && (
          <Alert
            type="error"
            message={collections.error}
            action={<Button onClick={collections.refresh}>重试</Button>}
          />
        )}
        <Select
          aria-label="技能素材的目标资料集合"
          placeholder="选择自己的资料集合"
          value={collectionId}
          onChange={setCollectionId}
          options={collections.data?.data
            .filter((c) => c.owned && c.status === "available")
            .map((c) => ({ value: c.id, label: `${c.name} · ${scopeNames[c.scope]}` }))}
          style={{ width: "100%" }}
        />
        {collections.data?.data.length === 0 && (
          <p>先在科研资料库创建自己的资料集合。</p>
        )}
        {collection && (
          <Alert
            type={collection.scope === "owner_private" ? "info" : "warning"}
            message={`保存到“${collection.name}” · ${scopeNames[collection.scope]}`}
            description={
              collection.scope === "public"
                ? "其他注册用户可读取并下载原件。"
                : collection.scope === "lab_shared"
                ? "同课题组获准成员可读取并下载原件。"
                : collection.scope === "task_scoped"
                ? "集合关联任务的获准成员可读取并下载原件。"
                : "只有你能读取此资料集合。"
            }
          />
        )}
        {status && <Alert type="info" message={status} />}
      </Modal>
    </>
  );
}
