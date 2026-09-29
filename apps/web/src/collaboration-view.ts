import type { ResponseFor } from '@research-agent-platform/contracts';
import { labels } from './contract-projection';
import { escapeHtml as e } from './view-model';

// Presentation of an already-authorized service projection. No local ACL or state transitions.
export type VisibleTask = ResponseFor<'tasks'>['data'][number];
const actionLabels: Record<string, string> = {
  claim: '认领', decide: '回应邀请', start: '开始', submit: '提交成果', review: '验收', invite: '邀请成员',
};

export function taskCard(task: VisibleTask, memberName: (id: string) => string): string {
  const summary = 'projection' in task;
  const status = summary ? '承接前摘要' : labels[task.status];
  const actions = task.allowedActions.map(action => actionLabels[action] ?? action).join('、');
  return `<article class="task-card"><span class="tag">${e(status)}</span><h2><a href="#/tasks/${e(task.id)}">${e(task.title)}</a></h2><p>版本 ${task.version} · 发起 ${e(memberName(task.initiatorId))} · 验收 ${e(memberName(task.reviewerId))}</p><p>${e(summary ? task.summary : task.goal)}</p>${summary && task.pendingInvitation ? '<p class="fine">待回应邀请 · 尚未承诺</p>' : ''}<div class="card-note green">${actions ? '可处理：' + e(actions) : '查看详情与当前安排'}</div></article>`;
}
