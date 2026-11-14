import {
  CloudUploadOutlined,
  MessageOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { Alert, Button, Input } from "antd";
import { useRef, useState } from "react";
import type { TaskTarget } from "../../../../integrations/deepseek-harness/desktop/task-workspace";

import {
  deliveryFilename as filename,
  deliveryReceiptLabel,
  prepareTaskDelivery,
} from "./task-delivery-command";
export function TaskDeliveryPanel({
  target,
  title,
  outputs,
  disabled,
  submit,
  stage,
  submitted,
  pending,
  retry,
  currentStatus = "",
  canSubmit = true,
}: {
  target: TaskTarget;
  title: string;
  outputs: { name: string; size: number }[];
  disabled: boolean;
  submit: (names: string[], summary?: string) => Promise<void>;
  stage: (paths?: string[]) => Promise<string[]>;
  submitted?: { names: string[]; status: string; summary: string };
  pending?: boolean;
  retry: () => Promise<void>;
  currentStatus?: string;
  canSubmit?: boolean;
}) {
  const [over, setOver] = useState(false),
    [assistant, setAssistant] = useState(false);
  const [text, setText] = useState(""),
    [selection, setSelection] = useState<string[]>([]);
  const [attached, setAttached] = useState<string[]>([]);
  const [question, setQuestion] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const flight = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (flight.current || disabled || !canSubmit) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "提交未完成，请重试。");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const choose = async (paths?: string[]) =>
    run(async () => {
      setBusyLabel("正在准备文件…");
      const names = await stage(paths);
      if (!names.length) return;
      setAttached(names);
      setSelection(names);
      setQuestion("");
    });
  const prepare = () => {
    if (disabled || busy || !canSubmit) return;
    const result = prepareTaskDelivery(
      text,
      title,
      outputs.map((file) => file.name),
      attached,
    );
    setSelection(result.names);
    setQuestion(result.question);
  };
  return (
    <section className="task-delivery" aria-label="提交文件">
      {pending && (
        <Alert
          type="warning"
          message="上次提交回执待核对"
          action={
            <Button
              loading={busy}
              disabled={!canSubmit}
              onClick={() => {
                if (flight.current || !canSubmit) return;
                flight.current = true;
                setBusy(true);
                setError("");
                void retry()
                  .catch((failure) =>
                    setError(failure instanceof Error ? failure.message : "请重试。"),
                  )
                  .finally(() => {
                    flight.current = false;
                    setBusy(false);
                  });
              }}
            >
              核对并重试
            </Button>
          }
        />
      )}
      <div className="task-delivery-header">
        <div>
          <h3>交付成果</h3>
          <p>
            {target.kind === "personal"
              ? "本任务支持文字成果"
              : "文件会提交到这项任务，负责人可直接下载"}
          </p>
        </div>
        {target.kind === "research" && canSubmit && (
          <Button
            icon={<MessageOutlined />}
            disabled={disabled || busy}
            aria-expanded={assistant}
            onClick={() => setAssistant((value) => !value)}
          >
            让助理帮我交
          </Button>
        )}
      </div>
      {target.kind === "personal" && (!submitted || canSubmit) && (
        <div className="task-delivery-text">
          <Input.TextArea
            aria-label="提交文字成果"
            value={text}
            rows={3}
            maxLength={8000}
            onChange={(event) => setText(event.target.value)}
            placeholder="写下成果，或粘贴结果"
            disabled={disabled || busy}
          />
          <Button
            type="primary"
            disabled={disabled || busy || !canSubmit || !text.trim()}
            loading={busy}
            onClick={() =>
              void run(async () => {
                await submit([], text.trim());
                setText("");
              })
            }
          >
            提交成果
          </Button>
        </div>
      )}
      {target.kind === "research" && canSubmit && (
        <div
          className={"task-delivery-drop" + (over ? " is-over" : "")}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled && !busy) setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            if (disabled || busy || !canSubmit) return;
            const paths = Array.from(event.dataTransfer.files)
              .map((file) => window.electronAPI?.getFilePath(file))
              .filter((value): value is string => Boolean(value));
            if (!paths.length) {
              setError("请从电脑拖入文件，或点选择文件。");
              return;
            }
            void choose(paths);
          }}
        >
          <CloudUploadOutlined aria-hidden />
          <div>
            <strong>拖入要交付的文件</strong>
            <small>最多 5 份 · 单份 512 MiB · 核对后提交</small>
          </div>
          <Button
            type="primary"
            disabled={disabled || busy}
            onClick={() => void choose()}
          >
            选择文件
          </Button>
        </div>
      )}
      {canSubmit && outputs.length > 0 && (
        <details className="task-delivery-output-options">
          <summary>从工作文件夹选择（{outputs.length}）</summary>
          {outputs.map((file) => (
            <Button
              key={file.name}
              disabled={disabled || busy}
              onClick={() => {
                setSelection([file.name]);
                setQuestion("");
              }}
            >
              {filename(file.name)}
            </Button>
          ))}
          <Button
            disabled={disabled || busy}
            onClick={() => {
              setSelection(outputs.map((file) => file.name));
              setQuestion("");
            }}
          >
            选择全部产出
          </Button>
        </details>
      )}
      {assistant && canSubmit && (
        <div className="task-delivery-assistant">
          <Input.Search
            aria-label="告诉助理要提交哪份文件"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSelection([]);
              setQuestion("");
            }}
            placeholder="把组会报告.pdf交到这项任务"
            enterButton="帮我准备"
            onSearch={prepare}
            disabled={disabled || busy}
          />
          <Button
            icon={<PaperClipOutlined />}
            disabled={disabled || busy}
            onClick={() => void choose()}
          >
            附上文件
          </Button>
          {attached.length > 0 && (
            <p>
              已附上 {attached.map(filename).join("、")}{" "}
              <Button
                size="small"
                type="text"
                disabled={busy}
                onClick={() => {
                  setAttached([]);
                  setSelection([]);
                }}
              >
                移除
              </Button>
            </p>
          )}
          {question && <p role="status">{question}</p>}
          {!!question &&
            !/先不提交/.test(question) &&
            outputs.slice(0, 20).map((file) => (
              <Button
                key={file.name}
                onClick={() => {
                  setSelection([file.name]);
                  setQuestion("");
                }}
              >
                {filename(file.name)}
              </Button>
            ))}
        </div>
      )}
      {selection.length > 0 && canSubmit && (
        <div className="task-delivery-confirm">
          <strong>提交到「{title}」</strong>
          {selection.map((name) => (
            <p key={name}>{filename(name)}</p>
          ))}
          <Button
            type="primary"
            loading={busy}
            disabled={disabled || !canSubmit}
            onClick={() =>
              void run(async () => {
                setBusyLabel("正在提交，等待回执…");
                await submit(selection);
                setSelection([]);
                setAttached([]);
                setText("");
              })
            }
          >
            确认提交
          </Button>
          <Button
            onClick={() => {
              setSelection([]);
              setAttached([]);
            }}
            disabled={busy}
          >
            先不交
          </Button>
        </div>
      )}
      {busy && <p role="status">{busyLabel || "正在核对提交回执…"}</p>}
      {error && <Alert type="error" message={error} />}
      {submitted?.status === "submitted" && (
        <div className="task-work-submitted" role="status">
          <strong>{deliveryReceiptLabel(currentStatus)}</strong>
          {!submitted.names.length && <p>{submitted.summary}</p>}
          {submitted.names.map((name) => (
            <p key={name}>{filename(name)}</p>
          ))}
        </div>
      )}
    </section>
  );
}
