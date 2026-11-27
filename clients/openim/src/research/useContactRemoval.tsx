import { Button, Modal } from 'antd';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Contact } from '@research-agent-platform/contracts';
import { feedbackToast } from '@/utils/common';
import { researchApi } from './api';
import { useResearchStore } from './store';
import { usePersonalOperation } from './usePersonalOperation';
import { contactRemoval, executeContactRemoval } from './contact-removal';
import { useContactRequestCache } from './contact-requests';

export function useContactRemoval(contact?: Contact, active = true, onRemoved?: () => void | Promise<void>) {
  const actorId = useResearchStore(s => s.actor?.member.id);
  const requestCache = useContactRequestCache();
  const operation = usePersonalOperation(active, `remove-contact:${contact?.id ?? ''}`);
  const inFlight = useRef(false);
  const dialog = useRef<ReturnType<typeof Modal.confirm>>();
  useLayoutEffect(() => () => { dialog.current?.destroy(); dialog.current = undefined; }, [operation.scope]);
  const [busy, setBusy] = useState(false);
  const action = contactRemoval(contact, actorId);
  const confirm = () => {
    if (!action || inFlight.current) return;
    const reviewed = { ...action }, ticket = operation.capture(), key = crypto.randomUUID();
    let closed = false;
    const isCurrent = () => !closed && ticket.isCurrent();
    dialog.current = Modal.confirm({
      title: `${reviewed.label}「${reviewed.displayName}」？`,
      content: reviewed.kind === 'agent'
        ? '将从 Agent 和联系人列表移除，停止后续回复与此 Agent 的定时工作，清除其外部服务密钥。历史聊天只读保留，已有任务、资料和成果保留。删除后可重新创建。'
        : '将从我的联系人移除并停止私聊。对方账号、历史消息、群聊和课题组成员身份保留，已有任务不会取消；之后可以重新添加。',
      okText: reviewed.label, okButtonProps: { danger: true }, cancelText: '取消',
      afterClose: () => { closed = true; },
      onOk: async () => {
        if (inFlight.current) throw new Error('正在处理，请稍后。');
        inFlight.current = true; if (isCurrent()) setBusy(true);
        try {
          const result = await executeContactRemoval(reviewed, key, {
            isCurrent, request: async (name, options) => {
              const result = await researchApi(name, options);
              if (name === 'revokeContact') requestCache.refresh();
              return result;
            },
            refresh: () => useResearchStore.getState().refresh(),
          });
          if (!result.current) return;
          feedbackToast({ msg: `${reviewed.kind === 'agent' ? 'Agent 已删除' : '联系人已删除'}${result.refreshed ? '' : '，列表暂未刷新，请刷新查看'}。` });
          try { await onRemoved?.(); }
          catch { if (isCurrent()) feedbackToast({ msg: '删除已完成，页面暂未刷新，请刷新查看。' }); }
        } catch (error) {
          if (isCurrent()) feedbackToast({ error, msg: error instanceof Error ? error.message : '删除未确认，请刷新核对后重试。' });
          throw error;
        } finally {
          inFlight.current = false; if (isCurrent()) setBusy(false);
        }
      },
    });
  };
  return { action, confirm, busy };
}
export function ContactRemovalButton({ contact, active = true, onRemoved }: {
  contact?: Contact; active?: boolean; onRemoved?: () => void | Promise<void>;
}) {
  const removal = useContactRemoval(contact, active, onRemoved);
  return removal.action ? <Button danger loading={removal.busy} onClick={removal.confirm}>{removal.action.label}</Button> : null;
}
