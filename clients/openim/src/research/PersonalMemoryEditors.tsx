import { Alert, Button, Input, Modal, Radio, Switch } from "antd";
import type {
  PersonalMemory,
  PersonalMemorySettings,
} from "@research-agent-platform/contracts";

export function PersonalMemoryEditor({
  open,
  editing,
  confirming,
  busy,
  ready,
  topic,
  content,
  scope,
  failure,
  onTopic,
  onContent,
  onScope,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: boolean;
  confirming: boolean;
  busy: boolean;
  ready: boolean;
  topic: string;
  content: string;
  scope: PersonalMemory["scope"];
  failure: string;
  onTopic: (value: string) => void;
  onContent: (value: string) => void;
  onScope: (value: PersonalMemory["scope"]) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      title={confirming ? "修改候选" : editing ? "修改记忆" : "记住一件事"}
      open={open}
      centered
      width={500}
      rootClassName="memory-editor-modal"
      destroyOnClose
      onCancel={onClose}
      maskClosable={!busy}
      closable={!busy}
      keyboard={!busy}
      footer={null}
    >
      <form
        className="memory-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !busy && topic.trim() && content.trim()) onSave();
        }}
      >
        <p className="memory-editor-intro">
          {confirming
            ? "调整内容后保存，即确认这条记忆，之后会用于回答。"
            : "告诉助理，你希望以后怎么一起工作。"}
        </p>
        {failure && <Alert type="error" message={failure} />}
        <label>
          这件事的主题
          <Input
            aria-label="偏好主题"
            placeholder="例如：回答方式、文献阅读"
            maxLength={80}
            value={topic}
            disabled={!ready || busy}
            onChange={(event) => onTopic(event.target.value)}
            autoFocus
          />
        </label>
        <label>
          希望记住什么
          <Input.TextArea
            aria-label="长期偏好内容"
            placeholder="例如：回答先给结论，再列关键依据。"
            maxLength={1000}
            showCount
            autoSize={{ minRows: 4, maxRows: 8 }}
            value={content}
            disabled={!ready || busy}
            onChange={(event) => onContent(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>什么时候使用</legend>
          <Radio.Group
            value={scope}
            disabled={!ready || busy}
            onChange={(event) => onScope(event.target.value)}
          >
            <Radio.Button value="general">通用偏好</Radio.Button>
            <Radio.Button value="topic">仅相关主题</Radio.Button>
          </Radio.Group>
          <p>
            {scope === "general"
              ? "在你的 Agent 私聊中，作为日常偏好参考。"
              : "只在聊天涉及这个主题时参考。"}
          </p>
        </fieldset>
        <div className="memory-editor-footer">
          <Button aria-label="取消" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            htmlType="submit"
            type="primary"
            loading={busy}
            disabled={!ready || !topic.trim() || !content.trim()}
          >
            {confirming ? "保存并确认" : editing ? "保存修改" : "保存记忆"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PersonalMemorySettingsEditor({
  open,
  busy,
  ready,
  policy,
  failure,
  onChange,
  onClose,
  onSave,
  onReload,
}: {
  open: boolean;
  busy: boolean;
  ready: boolean;
  policy?: PersonalMemorySettings;
  failure: string;
  onChange: (value: PersonalMemorySettings) => void;
  onClose: () => void;
  onSave: () => void;
  onReload: () => void;
}) {
  const update = (patch: Partial<PersonalMemorySettings>) => {
    if (policy) onChange({ ...policy, ...patch });
  };
  return (
    <Modal
      title="记忆与提醒设置"
      open={open}
      centered
      width={520}
      rootClassName="memory-editor-modal"
      destroyOnClose
      onCancel={onClose}
      maskClosable={!busy}
      closable={!busy}
      keyboard={!busy}
      footer={null}
    >
      <div className="memory-editor memory-settings">
        {failure && <Alert type="error" message={failure} />}
        <div className="memory-setting-row">
          <div>
            <h3>让助理提出记忆候选</h3>
            <p>候选仍需你确认，不会自动保存性格。</p>
          </div>
          <Switch
            aria-label="允许助理提出记忆候选"
            checked={policy?.candidateLearning || false}
            disabled={!ready || !policy || busy}
            onChange={(value) => update({ candidateLearning: value })}
          />
        </div>
        <label>
          默认提醒时区
          <Input
            aria-label="默认提醒时区"
            placeholder="Asia/Shanghai"
            value={policy?.timeZone || ""}
            disabled={!ready || !policy || busy}
            onChange={(event) => update({ timeZone: event.target.value })}
          />
          <small>聊天中的“明天九点”等时间按此时区安排。</small>
        </label>
        <div className="memory-setting-row">
          <div>
            <h3>安静时段</h3>
            <p>提醒使用这个默认时段，也可单独调整。</p>
          </div>
          <Switch
            aria-label="默认安静时段"
            checked={!!policy?.quietHours}
            disabled={!ready || !policy || busy}
            onChange={(value) =>
              update({ quietHours: value ? { start: "22:00", end: "08:00" } : null })
            }
          />
        </div>
        {policy?.quietHours && (
          <div className="memory-quiet-hours">
            <Input
              type="time"
              aria-label="默认安静时段开始"
              value={policy.quietHours.start}
              disabled={busy}
              onChange={(event) =>
                update({
                  quietHours: { ...policy.quietHours!, start: event.target.value },
                })
              }
            />
            <span>至</span>
            <Input
              type="time"
              aria-label="默认安静时段结束"
              value={policy.quietHours.end}
              disabled={busy}
              onChange={(event) =>
                update({
                  quietHours: { ...policy.quietHours!, end: event.target.value },
                })
              }
            />
          </div>
        )}
        <div className="memory-editor-footer">
          <Button type="text" disabled={!ready || busy} onClick={onReload}>
            重新读取
          </Button>
          <Button aria-label="取消" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!ready || !policy}
            onClick={onSave}
          >
            保存设置
          </Button>
        </div>
      </div>
    </Modal>
  );
}
