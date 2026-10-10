import { Alert, Button, Checkbox, Input, Modal, Segmented, Select, Switch } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { InstalledSkill, RequestFor } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchContactChat } from "./useResearchContactChat";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { SkillMaterials, localSkillLocator } from "./SkillMaterials";
import type { SkillBundleManifest } from "@research-agent-platform/research-skills/import";
import "./skills.scss";

type Draft = RequestFor<"installSkill">["body"] & {
  localBundle?: { token: string; manifest: SkillBundleManifest };
};
export function SkillLibrary() {
  const [scope, setScope] = useState<"mine" | "available" | "public">("mine"),
    [selected, setSelected] = useState<string>(),
    [draft, setDraft] = useState<Draft>(),
    [receipt, setReceipt] = useState<InstalledSkill>(),
    [updating, setUpdating] = useState<InstalledSkill>(),
    [installing, setInstalling] = useState(false),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [github, setGithub] = useState(""),
    [choices, setChoices] = useState<{ id: string; label: string; revision: string }[]>(
      [],
    );
  const state = useResearchStore(),
    operation = usePersonalOperation(true, "skill-library"),
    flight = useRef(false),
    openChat = useResearchContactChat();
  const read = useResearchRead(
    (signal) => researchApi("installedSkills", { query: { scope }, signal }),
    `skill-library:${scope}`,
  );
  const skill = read.data?.data.find((s) => s.id === selected);
  const source = useResearchRead(
    (signal) => researchApi("skillSource", { params: { id: skill?.id || "" }, signal }),
    `skill-source:${skill?.id}:${skill?.version}`,
    !!skill?.owned,
  );
  const versions = useResearchRead(
    (signal) =>
      researchApi("skillVersions", { params: { id: skill?.id || "" }, signal }),
    `skill-versions:${skill?.id}:${skill?.version}`,
    !!skill?.owned,
  );
  const uses = useResearchRead(
    (signal) => researchApi("skillUses", { params: { id: skill?.id || "" }, signal }),
    `skill-uses:${skill?.id}`,
    !!skill && (skill.owned || skill.canCall),
  );
  useLayoutEffect(() => {
    setDraft(undefined);
    setUpdating(undefined);
    setInstalling(false);
    setChoices([]);
    setFailure("");
    setBusy(false);
    setSelected(undefined);
    flight.current = false;
    setReceipt(undefined);
  }, [state.generation]);
  useLayoutEffect(
    () => () => {
      if (draft?.localBundle)
        void window.electronAPI
          ?.discardSkillBundle(draft.localBundle.token)
          .catch(() => {});
    },
    [draft?.localBundle?.token],
  );
  const agents = state.contacts
    .map((e) => e.contact)
    .filter(
      (c) =>
        c.identity.kind === "personal_agent" &&
        c.identity.ownerMemberId === state.actor?.member.id &&
        !c.agentRuntime,
    );
  const people = state.contacts
    .map((e) => e.contact)
    .filter(
      (c) =>
        c.identity.kind === "human" &&
        c.identity.memberId !== state.actor?.member.id &&
        c.relationship.status === "accepted",
    );
  const personOptions = people.flatMap((c) =>
    c.identity.kind === "human"
      ? [{ value: c.identity.memberId, label: c.displayName }]
      : [],
  );
  const native = !!window.electronAPI?.importPrivateSkill;
  async function act(action: () => Promise<unknown>, after?: () => void) {
    if (flight.current) return;
    const { isCurrent } = operation.capture();
    flight.current = true;
    setBusy(true);
    setFailure("");
    try {
      await action();
      if (isCurrent()) {
        after?.();
        await read.refresh();
      }
    } catch (e) {
      if (isCurrent())
        setFailure(e instanceof Error ? e.message : "技能操作失败，内容已保留。");
    } finally {
      if (isCurrent()) {
        flight.current = false;
        setBusy(false);
      }
    }
  }
  function settings(patch: Partial<NonNullable<InstalledSkill["settings"]>>) {
    if (!skill?.settings) return;
    void act(() =>
      researchApi("updateSkillSettings", {
        params: { id: skill.id },
        body: { ...skill.settings!, ...patch, expectedVersion: skill.version },
      }),
    );
  }
  async function load(kind: "folder" | "zip" | "github", id?: string) {
    await act(async () => {
      const { isCurrent } = operation.capture();
      const value = await window.electronAPI!.importPrivateSkill(kind, id);
      if (isCurrent() && value) {
        setDraft(value);
        setReceipt(undefined);
      } else if (value?.localBundle)
        await window.electronAPI!.discardSkillBundle(value.localBundle.token);
    });
  }
  const install = () =>
    act(
      async () => {
        if (!draft) return;
        const { isCurrent } = operation.capture();
        const body = { package: draft.package, source: draft.source };
        const result = receipt
          ? { data: receipt }
          : updating
          ? await researchApi("reviseSkill", {
              params: { id: updating.id },
              body: { ...body, expectedVersion: updating.version },
            })
          : await researchApi("installSkill", { body });
        if (!isCurrent()) return;
        setReceipt(result.data);
        if (draft.localBundle) {
          const locator = await localSkillLocator(result.data, state.actor!.member.id);
          if (!isCurrent()) return;
          try {
            await window.electronAPI!.commitSkillBundle(
              draft.localBundle.token,
              locator,
            );
          } catch (error) {
            throw Error(
              `说明已保存为修订 ${
                result.data.revision
              }，本机原件尚未关联。再次确认只重试原件保存：${
                error instanceof Error ? error.message : "保存失败"
              }`,
            );
          }
        }
        if (!isCurrent()) return;
        setSelected(result.data.id);
      },
      () => {
        setDraft(undefined);
        setInstalling(false);
        setUpdating(undefined);
        setScope("mine");
        setReceipt(undefined);
      },
    );
  return (
    <section className="skill-library" aria-label="我的技能">
      <header className="skill-library-header">
        <div>
          <h2>我的技能</h2>
          <p>把自己的方法装给 Agent。安装后默认只有你能使用。</p>
        </div>
        <Button
          type="primary"
          disabled={!native || busy}
          onClick={() => {
            setInstalling(true);
            setUpdating(undefined);
            setDraft(undefined);
            setChoices([]);
          }}
        >
          安装技能
        </Button>
      </header>
      {!native && (
        <Alert
          type="info"
          message="请在 Windows 桌面端安装本地文件夹、ZIP 或 GitHub 技能。"
        />
      )}
      <Segmented
        value={scope}
        onChange={(v) => {
          setScope(v as typeof scope);
          setSelected(undefined);
        }}
        options={[
          { label: "我的技能", value: "mine" },
          { label: "获准使用", value: "available" },
          { label: "公开介绍", value: "public" },
        ]}
      />
      {failure && (
        <Alert type="error" message={failure} closable onClose={() => setFailure("")} />
      )}
      {read.error && (
        <Alert
          type="error"
          message={read.error}
          action={<Button onClick={read.refresh}>重试</Button>}
        />
      )}
      <div className="skill-library-body">
        <aside>
          {!read.data && !read.error && <p role="status">正在读取技能…</p>}
          {read.data?.data.length === 0 && (
            <div className="skill-empty">
              <h3>{scope === "mine" ? "还没有安装技能" : "暂无可见技能"}</h3>
              <p>
                {scope === "mine"
                  ? "选择自己的 SKILL.md 文件夹，或导入作者提供的技能 ZIP。"
                  : "公开介绍不等于授权使用。由技能所有者分别设置调用和源码权限。"}
              </p>
            </div>
          )}
          {read.data?.data.map((s) => (
            <button
              key={s.id}
              className="skill-row"
              aria-pressed={s.id === selected}
              onClick={() => setSelected(s.id)}
            >
              <strong>{s.name}</strong>
              <small>
                {s.release} ·{" "}
                {s.owned
                  ? s.settings?.listed
                    ? "介绍已公开"
                    : "私人技能"
                  : "授权按所有者设置"}
              </small>
              <p>{s.description}</p>
              <span>
                {s.enabled ? "已启用" : "已停用"}
                {s.requirements.length ? " · 有执行依赖" : ""}
              </span>
            </button>
          ))}
        </aside>
        <main>
          {skill ? (
            <>
              <div className="skill-detail-heading">
                <h2>{skill.name}</h2>
                <span>
                  {skill.release} · 修订 {skill.revision}
                </span>
              </div>
              <p>{skill.description}</p>
              <Alert
                type={skill.requirements.length ? "warning" : "info"}
                message={
                  skill.requirements.length
                    ? "部分流程需要额外能力"
                    : "文字流程已可用于聊天"
                }
                description={
                  skill.requirements.length
                    ? `依赖：${skill.requirements.join(
                        "、",
                      )}。当前执行器只运行文字流程，不能执行包内脚本、生成图片或创建 checkpoint。安装不会替代这些运行环境。`
                    : "Agent 会读取完整 SKILL.md 与你选择的参考文字；使用你的模型配置。技能文本不能扩大工具或文件访问权限。"
                }
              />
              <p className="skill-muted">
                {skill.references.length} 个参考文字文件 · {skill.scriptCount}{" "}
                个脚本文件 · {skill.assetCount}{" "}
                个素材文件。账号保存说明与参考文字；完整原件保存在导入设备，不自动执行或上传。
              </p>
              <SkillMaterials key={`${skill.id}:${skill.revision}`} skill={skill} />
              {skill.settings && (
                <section className="skill-settings">
                  <h3>使用与共享</h3>
                  <label>
                    启用技能
                    <Switch
                      checked={skill.enabled}
                      disabled={busy}
                      onChange={(v) => settings({ enabled: v })}
                    />
                  </label>
                  <p>绑定到自己的 Agent</p>
                  <Select
                    mode="multiple"
                    aria-label="绑定技能的 Agent"
                    value={skill.settings.boundAgentIds}
                    disabled={busy}
                    options={agents.map((a) => ({ value: a.id, label: a.displayName }))}
                    onChange={(v) => settings({ boundAgentIds: v })}
                  />
                  <label>
                    公开名称和介绍
                    <Switch
                      checked={skill.settings.listed}
                      disabled={busy}
                      onChange={(v) => settings({ listed: v })}
                    />
                  </label>
                  <p className="skill-muted">
                    公开介绍只展示技能名、简介和依赖信息；不会自动公开源码，也不会让别人消耗你的模型
                    Key。
                  </p>
                  <p>允许这些好友调用</p>
                  <Select
                    mode="multiple"
                    aria-label="技能调用授权"
                    value={skill.settings.callMemberIds}
                    disabled={busy}
                    options={personOptions}
                    onChange={(v) => settings({ callMemberIds: v })}
                  />
                  <p className="skill-muted">
                    对方在自己的 Agent
                    中调用，使用对方模型配置。模型会获得技能说明，请自行评估输出可能包含方法内容。
                  </p>
                  <p>允许这些好友复制文字源码</p>
                  <Select
                    mode="multiple"
                    aria-label="技能源码授权"
                    value={skill.settings.sourceMemberIds}
                    disabled={busy}
                    options={personOptions}
                    onChange={(v) => settings({ sourceMemberIds: v })}
                  />
                  <p className="skill-muted">
                    复制后形成对方的私人副本。撤销授权会停止后续访问和调用，已复制内容不能远程收回。
                  </p>
                  <div className="skill-actions">
                    {skill.settings.boundAgentIds.map((id) => (
                      <Button
                        key={id}
                        disabled={busy || !skill.enabled}
                        onClick={() =>
                          void act(async () => {
                            const { isCurrent } = operation.capture();
                            await openChat(id, isCurrent);
                          })
                        }
                      >
                        与 {agents.find((a) => a.id === id)?.displayName || "Agent"}{" "}
                        聊天
                      </Button>
                    ))}
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setUpdating(skill);
                        setInstalling(true);
                        setDraft(undefined);
                        setChoices([]);
                      }}
                    >
                      安装新版本
                    </Button>
                  </div>
                </section>
              )}
              {!skill.owned && skill.canReadSource && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(
                      async () => {
                        const { isCurrent } = operation.capture();
                        const value = await researchApi("skillSource", {
                          params: { id: skill.id },
                        });
                        if (!isCurrent()) return;
                        await researchApi("installSkill", {
                          body: {
                            package: value.data.package,
                            source: {
                              kind: "copy",
                              label: `授权副本：${skill.name}`,
                              revision: String(skill.revision),
                            },
                          },
                        });
                      },
                      () => setScope("mine"),
                    )
                  }
                >
                  复制到我的私人技能
                </Button>
              )}
              {versions.data && (
                <section>
                  <h3>版本记录</h3>
                  {versions.data.data.map((v) => (
                    <p key={v.revision}>
                      {v.release} · 修订 {v.revision}{" "}
                      <small>{v.digest.slice(0, 12)}</small>{" "}
                      {v.revision !== skill.revision && (
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              researchApi("rollbackSkill", {
                                params: { id: skill.id },
                                body: {
                                  expectedVersion: skill.version,
                                  revision: v.revision,
                                },
                              }),
                            )
                          }
                        >
                          切换到此版本
                        </Button>
                      )}
                    </p>
                  ))}
                </section>
              )}
              {source.error && <Alert type="error" message={source.error} />}
              {source.data && (
                <details>
                  <summary>
                    查看私人 SKILL.md（{source.data.data.package.instructions.length}{" "}
                    字符）
                  </summary>
                  <SafeMessageMarkdown text={source.data.data.package.instructions} />
                </details>
              )}
              {(skill.owned || skill.canCall) && (
                <section>
                  <h3>我的调用记录</h3>
                  <p className="skill-muted">
                    “回复完成”只表示模型已返回文字，不能代表脚本或整个流程执行完成。
                  </p>
                  {uses.error && <Alert message={uses.error} type="error" />}
                  {uses.data?.data.length === 0 && (
                    <p>暂无调用。在绑定 Agent 的聊天中，选择技能后发送需求。</p>
                  )}
                  {uses.data?.data.map((u) => (
                    <p key={u.turnId}>
                      {new Date(u.createdAt).toLocaleString()} · {u.release} ·{" "}
                      {u.status === "succeeded" ? "回复完成" : u.status}
                      {u.failure ? ` · ${u.failure}` : ""}
                    </p>
                  ))}
                </section>
              )}
            </>
          ) : (
            <div className="skill-empty">
              <h3>让 Agent 学会你的做事方法</h3>
              <p>选择技能查看版本、绑定的 Agent 和授权范围。</p>
            </div>
          )}
        </main>
      </div>
      <Modal
        open={installing}
        title={updating ? "更新私人技能" : "安装私人技能"}
        width={760}
        onCancel={() => {
          if (!busy) {
            setInstalling(false);
            setDraft(undefined);
            setUpdating(undefined);
            setReceipt(undefined);
            void read.refresh();
          }
        }}
        footer={
          draft ? (
            <Button type="primary" loading={busy} onClick={() => void install()}>
              {receipt
                ? "重试保存本机原件"
                : updating
                ? "保存为新版本"
                : "确认安装为私人技能"}
            </Button>
          ) : null
        }
      >
        <div className="skill-actions">
          <Button disabled={busy || !native} onClick={() => void load("folder")}>
            选择文件夹
          </Button>
          <Button disabled={busy || !native} onClick={() => void load("zip")}>
            选择 ZIP
          </Button>
        </div>
        <Input
          aria-label="技能 GitHub 地址"
          value={github}
          onChange={(e) => setGithub(e.target.value)}
          placeholder="https://github.com/作者/技能仓库"
        />
        <Button
          disabled={busy || !native || !github.trim()}
          loading={busy}
          onClick={() =>
            void act(async () => {
              const { isCurrent } = operation.capture();
              const result = await window.electronAPI!.inspectSkillGithub(
                github.trim(),
              );
              if (isCurrent()) setChoices(result);
            })
          }
        >
          检查 GitHub 版本
        </Button>
        {choices.map((c) => (
          <p key={c.id}>
            <Button disabled={busy} onClick={() => void load("github", c.id)}>
              {c.label}
            </Button>{" "}
            <small>固定提交 {c.revision.slice(0, 12)}</small>
          </p>
        ))}
        {failure && <Alert type="error" message={failure} />}
        {draft && (
          <section className="skill-import-review">
            <h3>{draft.package.name}</h3>
            <p>{draft.package.description}</p>
            <p>
              版本：{draft.package.release} · {draft.package.references.length}{" "}
              个参考文字 · {draft.package.instructions.length} 字符说明
            </p>
            <p>来源：{draft.source.label}</p>
            {draft.localBundle && (
              <p>
                将保留 {draft.localBundle.manifest.files.length} 个本机原件，
                {(draft.localBundle.manifest.totalBytes / 1024 / 1024).toFixed(1)}{" "}
                MiB。ZIP 同时保留完整原包；文件夹排除 .git / node_modules /
                __pycache__。取消安装不保存本机原件。
              </p>
            )}
            <Alert
              type={draft.package.requirements.length ? "warning" : "info"}
              message={
                draft.package.requirements.length
                  ? `检测到执行依赖：${draft.package.requirements.join("、")}`
                  : "文字技能可以接入当前聊天执行器"
              }
              description="确认后把说明和参考文字保存到你的私人账号空间，调用时发送给你的模型服务商；同时把完整原件保存于本机资料目录。脚本不会执行，图片不会自动上传或生成。"
            />
            <details>
              <summary>检查 SKILL.md</summary>
              <SafeMessageMarkdown text={draft.package.instructions} />
            </details>
          </section>
        )}
      </Modal>
    </section>
  );
}

export function useSkillChatSelection(
  agentId: string | undefined,
  scope: string,
  enabled: boolean,
) {
  const read = useResearchRead(
    (signal) =>
      researchApi("installedSkills", {
        query: { scope: "available", agentId },
        signal,
      }),
    `skill-chat:${scope}:${agentId}`,
    enabled && !!agentId,
  );
  const [choice, setChoice] = useState<{
    scope: string;
    id: string;
    version: number;
    paths: string[];
    accept: boolean;
  }>();
  const selected =
    choice?.scope === scope
      ? read.data?.data.find(
          (s) => s.id === choice.id && s.version === choice.version && s.canCall,
        )
      : undefined;
  const selection =
    selected && choice
      ? {
          id: selected.id,
          version: selected.version,
          referencePaths: choice.paths,
          acceptLimitations: choice.accept,
        }
      : undefined;
  const stale = enabled && choice?.scope === scope && !selected;
  const controls =
    enabled && (read.data?.data.some((s) => s.canCall) || stale) ? (
      <div className="skill-chat-controls">
        {stale && (
          <Alert
            type="warning"
            message="所选技能已更新、撤权或暂时无法读取，请重新选择或取消本次技能。"
            action={<Button onClick={() => setChoice(undefined)}>取消技能</Button>}
          />
        )}
        <Select
          aria-label="本次使用的技能"
          placeholder="使用技能（可选）"
          allowClear
          value={selected?.id ?? (stale ? choice?.id : undefined)}
          options={(read.data?.data ?? [])
            .filter((s) => s.canCall)
            .map((s) => ({ value: s.id, label: `${s.name} · ${s.release}` }))}
          onChange={(id) => {
            const s = read.data?.data.find((s) => s.id === id);
            setChoice(
              s
                ? { scope, id, version: s.version, paths: [], accept: false }
                : undefined,
            );
          }}
        />
        {selected && choice && (
          <>
            <Select
              aria-label="加载技能参考文件"
              mode="multiple"
              placeholder="按本次阶段选择参考文字"
              maxTagCount={1}
              value={choice.paths}
              options={selected.references.map((f) => ({
                value: f.path,
                label: f.path,
              }))}
              onChange={(paths) => setChoice({ ...choice, paths: paths.slice(0, 8) })}
            />
            {selected.requirements.length > 0 && (
              <Checkbox
                checked={choice.accept}
                onChange={(e) => setChoice({ ...choice, accept: e.target.checked })}
              >
                本次仅运行文字流程（缺少{selected.requirements.join("、")}）
              </Checkbox>
            )}
            <span>
              {selected.name} · 完整说明 + {choice.paths.length} 个参考文件 · 总预算上限
              128,000 tokens
            </span>
          </>
        )}
      </div>
    ) : null;
  return {
    selection,
    controls,
    invalid:
      !!stale || (!!selected && selected.requirements.length > 0 && !choice?.accept),
    error: read.error,
  };
}
