import { FolderOpenOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Input, Modal, Spin } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useConversationStore, useUserStore } from "@/store";
import type { LocalFolderManifest, LocalFolderSelection } from "@/types/localFolder";
import type { IElectronAPI } from "@/types/globalExpose";
import { researchMode } from "./api";
import { useResearchStore } from "./store";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "./useAgentChatOperation";
import type { SelectedFileKind } from "./useScopedFileSender";
import { activeDesktopWork, runDesktopWork, useDesktopWork } from "./desktop-work";
import DesktopWorkCard from "./DesktopWorkCard";

const readableError = (error: unknown) => {
  const text =
    error instanceof Error ? error.message : "文件夹读取失败，请重新选择后重试。";
  const folderMessage = text.match(/LOCAL_FOLDER_[A-Z_]+:\s*(.+)/)?.[1];
  return (
    folderMessage ||
    (text.startsWith("Error invoking remote method")
      ? "文件夹读取失败，请重新选择后重试。"
      : text)
  );
};

/** One explicit folder grant, bound to the actor and private chat which opened it. */
export default function LocalFolderAction({
  sendFile,
  menu = false,
}: {
  sendFile: (
    file: File,
    kind: SelectedFileKind,
    isCurrent?: () => boolean,
    agentFileText?: string,
  ) => Promise<boolean>;
  menu?: boolean;
}) {
  const research = useResearchStore();
  const conversation = useConversationStore((s) => s.currentConversation);
  const user = useUserStore();
  const path = useLocation().pathname;
  const capture = useAgentChatOperation();
  const bridge = window.electronAPI;
  const contact = research.contacts.find(
    (entry) => entry.userID === conversation?.userID,
  )?.contact;
  const mapping = research.mappings.find(
    (entry) => entry.imConversationID === conversation?.conversationID,
  );
  const eligible = Boolean(
    researchMode &&
      typeof bridge?.pickLocalFolder === "function" &&
      typeof bridge.readLocalFolderSelection === "function" &&
      typeof bridge.releaseLocalFolder === "function" &&
      research.actor &&
      research.session?.status === "available" &&
      research.sessionActorId === research.actor.member.id &&
      research.session.user?.userID === user.selfInfo.userID &&
      user.connectState === "success" &&
      user.syncState === "success" &&
      !user.isLogining &&
      conversation &&
      !conversation.groupID &&
      mapping &&
      mapping.kind !== "group" &&
      mapping.transportStatus === "ready" &&
      contact &&
      contact.identity.kind !== "human" &&
      !contact.agentRuntime &&
      contact.allowedActions.includes("chat"),
  );
  const scope = `${research.generation}:${research.actor?.member.id}:${conversation?.conversationID}:${path}`;
  const lifecycle = useRef<{
    epoch: number;
    operation: AgentChatOperation;
    bridge: IElectronAPI;
    grant?: string;
  }>();
  const epoch = useRef(0);
  const request = useRef(0);
  const busyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState<LocalFolderManifest>();
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<LocalFolderSelection>();
  const [previewId, setPreviewId] = useState<string>();
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState<"pick" | "preview" | "send">();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [readCount, setReadCount] = useState(0);
  const jobs = useDesktopWork((s) => s.jobs);
  const workActive = jobs.some((job) => activeDesktopWork(job) &&
    job.scope.actorId === research.actor?.member.id &&
    job.scope.conversationId === mapping?.researchConversationId);
  const release = (api: IElectronAPI, id?: string) => {
    if (id) void api.releaseLocalFolder(id).catch(() => {});
  };
  const clearLifecycle = () => {
    epoch.current++;
    request.current++;
    busyRef.current = false;
    const previous = lifecycle.current;
    lifecycle.current = undefined;
    previous?.operation.dispose();
    if (previous) release(previous.bridge, previous.grant);
  };
  const close = () => {
    clearLifecycle();
    setOpen(false);
    setBusy(undefined);
    setManifest(undefined);
    setPreview(undefined);
    setSelected([]);
    setTask("");
    setError("");
  };
  const current = (entry: NonNullable<typeof lifecycle.current>) => {
    const live = useResearchStore.getState(),
      selected = useConversationStore.getState().currentConversation;
    const peer = live.contacts.find(
      (item) => item.userID === selected?.userID,
    )?.contact;
    const mapped = live.mappings.find(
      (item) => item.imConversationID === selected?.conversationID,
    );
    return (
      lifecycle.current === entry &&
      entry.epoch === epoch.current &&
      entry.operation.isCurrent() &&
      live.session?.status === "available" &&
      live.sessionActorId === live.actor?.member.id &&
      live.session.user?.userID === useUserStore.getState().selfInfo.userID &&
      !!selected &&
      !selected.groupID &&
      !!mapped &&
      mapped.kind !== "group" &&
      mapped.transportStatus === "ready" &&
      !!peer &&
      peer.identity.kind !== "human" &&
      !peer.agentRuntime &&
      peer.allowedActions.includes("chat")
    );
  };

  useLayoutEffect(() => {
    close();
    setNotice("");
    const unsubscribe = useConversationStore.subscribe(() => {
      const entry = lifecycle.current;
      if (entry && !entry.operation.isCurrent()) close();
    });
    return () => {
      unsubscribe();
      clearLifecycle();
    };
  }, [scope, eligible]);

  const choose = async () => {
    if (!eligible || !bridge || busyRef.current || workActive) return;
    clearLifecycle();
    const entry = {
      epoch: epoch.current,
      operation: capture(),
      bridge,
      grant: undefined as string | undefined,
    };
    lifecycle.current = entry;
    busyRef.current = true;
    setOpen(true);
    setBusy("pick");
    setError("");
    setNotice("");
    setManifest(undefined);
    setSelected([]);
    setPreview(undefined);
    setPreviewId(undefined);
    setTask("");
    try {
      const result = await bridge.pickLocalFolder();
      if (!current(entry)) {
        release(bridge, result?.grantId);
        return;
      }
      if (!result) {
        close();
        return;
      }
      entry.grant = result.grantId;
      setManifest(result);
    } catch (cause) {
      if (current(entry)) setError(readableError(cause));
    } finally {
      if (current(entry)) {
        busyRef.current = false;
        setBusy(undefined);
      }
    }
  };
  const showPreview = async (id: string) => {
    const entry = lifecycle.current;
    if (!entry?.grant || !current(entry) || busyRef.current) return;
    const sequence = ++request.current;
    busyRef.current = true;
    setBusy("preview");
    setError("");
    setPreview(undefined);
    setPreviewId(id);
    try {
      const result = await entry.bridge.readLocalFolderSelection({
        grantId: entry.grant,
        fileIds: [id],
        mode: "workspace",
      });
      if (current(entry) && sequence === request.current) {
        if (
          result.grantId !== entry.grant ||
          result.files.length !== 1 ||
          result.files[0].id !== id
        )
          throw new Error("文件预览与所选内容不一致，请重新选择文件夹。");
        setPreview(result);
      }
    } catch (cause) {
      if (current(entry) && sequence === request.current)
        setError(readableError(cause));
    } finally {
      if (current(entry) && sequence === request.current) {
        busyRef.current = false;
        setBusy(undefined);
      }
    }
  };
  const send = async () => {
    const entry = lifecycle.current;
    if (
      !entry?.grant ||
      !manifest ||
      !current(entry) ||
      busyRef.current ||
      !selected.length ||
      !task.trim()
    )
      return;
    const ids = [...selected],
      instruction = task.trim();
    busyRef.current = true;
    setBusy("send");
    setError("");
    setReadCount(0);
    try {
      const files: LocalFolderSelection["files"] = [];
      // Each file has its own extraction limit. All selected sources are read before
      // dispatch, so a failed local read never starts a half-selected model task.
      for (const id of ids) {
        const result = await entry.bridge.readLocalFolderSelection({ grantId: entry.grant, fileIds: [id], mode: "workspace" });
        if (!current(entry)) return;
        if (result.grantId !== entry.grant || result.files.length !== 1 || result.files[0].id !== id)
          throw new Error("读取结果与所选文件不一致，请重新选择文件夹。");
        files.push(result.files[0]);
        setReadCount(files.length);
      }
      if (!current(entry) || !mapping || !research.actor) return;
      const work = runDesktopWork({ imID: conversation!.conversationID,
        scope: { actorId: research.actor.member.id, conversationId: mapping.researchConversationId },
        folderName: manifest.folderName, files, task: instruction });
      // The desktop runner retains its own actor and target-chat binding, so
      // choosing another chat does not transfer source text to that new contact.
      void work.catch((cause) => setNotice(readableError(cause)));
      close();
      setNotice("文件任务已开始，可继续聊天，在文件工作区查看进度和报告。");
    } catch (cause) {
      if (current(entry)) setError(readableError(cause));
    } finally {
      if (current(entry)) {
        busyRef.current = false;
        setBusy(undefined);
      }
    }
  };

  if (!eligible) return null;
  return (
    <>
      <button
        type="button"
        className={
          menu
            ? "flex h-20 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 hover:bg-blue-50"
            : "ml-1 flex h-8 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }
        aria-label="本地文件夹"
        title={workActive ? "此Agent正在处理文件任务" : "选择文件 → 逐项分析 → 保存报告"}
        disabled={workActive}
        onClick={() => void choose()}
      >
        <FolderOpenOutlined className="text-lg" />
        <span>本地文件夹</span>
      </button>
      {notice && (
        <span
          role="status"
          className="max-w-[220px] truncate text-xs text-slate-600"
          title={notice}
        >
          {notice}
        </span>
      )}
      <Modal
        title="让 Agent 处理本地文件"
        open={open}
        onCancel={close}
        width={900}
        destroyOnClose
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={close}>取消</Button>
            <Button
              type="primary"
              loading={busy === "send"}
              disabled={!!busy || !selected.length || !task.trim()}
              onClick={() => void send()}
            >
              {busy === "send" ? `读取文件 ${readCount}/${selected.length}` : "开始分析并生成报告"}
            </Button>
          </div>
        }
        styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      >
        <p className="mb-3 text-sm text-slate-600">
          先在本机预览。开始后，所选文字交给此 Agent 的在线模型逐项分析、汇总，报告保存在这台电脑。源文件保持原样。
        </p>
        {error && <Alert className="mb-3" type="error" showIcon message={error} />}
        {busy === "pick" ? (
          <div className="py-8 text-center">
            <Spin />
            <p className="mt-3">等待选择并扫描文件夹…</p>
          </div>
        ) : manifest ? (
          <>
            <div className="mb-2 flex flex-wrap justify-between gap-1 text-sm">
              <strong className="break-all">{manifest.folderName}</strong>
              <span className="text-slate-600">
                已选 {selected.length} / {manifest.limits.maxSelectedFiles}
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-600">
              列出 {manifest.files.length} 个可读取文件，排除{" "}
              {manifest.scan.excludedEntries} 项。
              {manifest.scan.truncated
                ? "扫描达到上限，未列出全部目录；可选择更小的文件夹。"
                : "默认不选择文件。"}{" "}
              未选文件不会发送。
            </p>
            <div className="grid min-w-0 gap-3 min-[601px]:grid-cols-2">
              <div
                className="max-h-[34vh] overflow-auto rounded border border-slate-200"
                aria-label="可选择的本地文件"
              >
                {!manifest.files.length && (
                  <p className="p-3 text-sm text-slate-600">
                    没有找到可读取的文字文件，请选择其他文件夹。
                  </p>
                )}
                {manifest.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-start gap-2 border-b border-slate-100 px-2 py-2 last:border-0"
                  >
                    <Checkbox
                      aria-label={`选择 ${file.relativePath}`}
                      checked={selected.includes(file.id)}
                      disabled={
                        !!busy ||
                        (!selected.includes(file.id) &&
                          selected.length >= manifest.limits.maxSelectedFiles)
                      }
                      onChange={(event) => {
                        setSelected((value) =>
                          event.target.checked
                            ? [...value, file.id]
                            : value.filter((id) => id !== file.id),
                        );
                        setError("");
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block break-all text-sm">
                        {file.relativePath}
                      </span>
                      <span className="text-xs text-slate-500">
                        {file.kind.toUpperCase()} · {file.byteLength} 字节
                      </span>
                    </div>
                    <Button
                      size="small"
                      disabled={!!busy}
                      onClick={() => void showPreview(file.id)}
                    >
                      预览
                    </Button>
                  </div>
                ))}
              </div>
              <div
                className="min-w-0 rounded border border-slate-200 bg-slate-50 p-3"
                aria-label="文件内容预览"
              >
                <div className="mb-2 break-all text-xs font-medium text-slate-600">
                  {manifest.files.find((file) => file.id === previewId)?.relativePath ||
                    "选择文件旁的预览"}
                </div>
                {busy === "preview" ? (
                  <Spin />
                ) : preview?.files[0] ? (
                  <>
                    <p className="mb-2 text-xs text-slate-600">
                      {preview.files[0].text.length} 字符
                      {preview.files[0].pageCount === undefined
                        ? ""
                        : ` · ${preview.files[0].pageCount} 页可提取文字`}
                      ；只发送文字，不含图片。
                    </p>
                    <pre className="max-h-[26vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
                      {preview.files[0].text}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">
                    预览不会上传，也不会自动勾选文件。
                  </p>
                )}
              </div>
            </div>
            <label
              className="mb-1 mt-3 block text-sm font-medium"
              htmlFor="local-folder-task"
            >
              希望Agent做什么
            </label>
            <Input.TextArea
              id="local-folder-task"
              aria-label="文件夹任务"
              rows={2}
              maxLength={4000}
              value={task}
              disabled={busy === "send"}
              onChange={(event) => {
                setTask(event.target.value);
                setError("");
              }}
              placeholder="例如：比较选中的研究笔记，列出主要结论与待核对的问题"
            />
            <p className="mt-1 text-xs text-slate-600">
              最多10个文件，每个最多20万字符 / 512KB提取文字；长文件自动分段，最多40步分析后汇总，会调用在线模型。扫描PDF和图片暂不支持。
            </p>
          </>
        ) : (
          <Button onClick={() => void choose()}>重新选择文件夹</Button>
        )}
      </Modal>
      {mapping && research.actor && typeof bridge?.listDesktopReports === "function" &&
        <DesktopWorkCard key={`${research.generation}:${mapping.researchConversationId}`}
          scope={{ actorId: research.actor.member.id, conversationId: mapping.researchConversationId }} />}
    </>
  );
}
