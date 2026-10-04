import type { Contact, Conversation, ResponseFor, TaskModel } from '@research-agent-platform/contracts';
import { labels } from './contract-projection';
import { runLabels } from './ai-view';
import type { ConversationWorkflowView, WorkflowTaskView, WorkflowStage } from './chat-workflow-types';

type TaskData = ResponseFor<'task'>['data'];
const stageFor: Record<TaskModel['status'], WorkflowStage> = {
  unassigned: 'accept', awaiting_acceptance: 'accept', ready: 'work',
  in_progress: 'work', blocked: 'work', changes_requested: 'work',
  in_review: 'review', completed: 'done', cancelled: 'cancelled',
};

/** Only the task API's current ACL projection supplies task facts. A group's
 * membership, messages and successful model runs never supply a commitment or
 * an acceptance decision. No fetching or mutating commands in this projection. */
export function projectConversationWorkflow(
  conversation: Conversation,
  taskDetails: ReadonlyMap<string, TaskData>,
  contacts: readonly Contact[],
  members: readonly { id: string; displayName: string }[],
): ConversationWorkflowView | undefined {
  if (conversation.kind !== 'group') return undefined;
  const memberName = (id: string) => members.find(m => m.id === id)?.displayName ?? '已承接成员';
  const tasks: WorkflowTaskView[] = [...new Set(conversation.taskIds)].map(id => {
    const data = taskDetails.get(id);
    if (!data) return {
      id, title: '任务详情暂不可读取', status: '权限或状态待核对', stage: 'restricted',
      goal: '', acceptanceCriteria: '', assignees: [],
      nextStep: '继续群聊；任务详情须取得独立授权后查看。', actionLabel: '', href: '',
    };
    const href = `#/tasks/${encodeURIComponent(id)}`;
    if (!('task' in data)) return {
      id, title: data.title, status: data.pendingInvitation ? '待你承接' : '可查看任务摘要',
      stage: 'restricted', goal: data.summary, acceptanceCriteria: data.acceptanceCriteria,
      assignees: [], nextStep: data.pendingInvitation
        ? '先核对邀请的范围与时间，再决定是否接受任务。'
        : '目前可读取摘要；加入群与取得任务权限分别处理。',
      actionLabel: data.allowedActions.includes('decide') ? '查看并回应邀请'
        : data.allowedActions.includes('claim') ? '查看并认领' : '查看任务摘要', href,
    };
    const task = data.task;
    const assignees = [...new Set(data.assignments.filter(a => a.status === 'accepted').map(a => {
      if (a.memberId) return memberName(a.memberId);
      const capability = a.capability;
      return contacts.find(c => c.identity.kind === 'public_agent' && capability
        && c.identity.capability.id === capability.id && c.identity.capability.version === capability.version)?.displayName
        ?? '已接受的公共 AI 能力';
    }))];
    const latestDelivery = data.deliverables.reduce<(typeof data.deliverables)[number] | undefined>(
      (latest, delivery) => !latest || delivery.revision > latest.revision ? delivery : latest, undefined,
    );
    // Task completion is authoritative even if older delivery/run records remain.
    const latestRun = [...data.executions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    let nextStep: string;
    let actionLabel: string;
    switch (task.status) {
      case 'unassigned':
        nextStep = '确认任务范围和验收要求，邀请成员承接或自行认领。'; actionLabel = '安排与承接'; break;
      case 'awaiting_acceptance':
        nextStep = '等待受邀成员接受具体范围与时间；加入群不代表接单。'; actionLabel = '查看承接情况'; break;
      case 'ready':
        nextStep = '已有任务承诺，核对材料与依赖后开始；AI 执行仍需确认能力、输入和预算。'; actionLabel = '开始任务'; break;
      case 'blocked':
        nextStep = `处理卡点：${task.blocker?.reason ?? '请查看当前阻塞记录'}。${task.blocker?.requestedAction ?? ''}`; actionLabel = '处理卡点'; break;
      case 'changes_requested':
        nextStep = '按验收意见修改后重新提交新交付版本，再由验收人审核。'; actionLabel = '查看意见与重新交付'; break;
      case 'in_review':
        nextStep = '由验收人核对指定交付版本，决定通过或要求修改。'; actionLabel = '查看交付与验收'; break;
      case 'completed':
        nextStep = '任务已完成，可查看交付与指定版本的验收记录。'; actionLabel = '查看成果与验收'; break;
      case 'cancelled':
        nextStep = '任务已取消；保留历史记录，不能继续执行或交付。'; actionLabel = '查看取消记录'; break;
      default:
        nextStep = latestRun?.status === 'succeeded' && !latestRun.candidateDeliverableId
          ? 'AI 已产生候选成果，核对并提交为交付后，再由验收人审核。'
          : '完成约定工作并提交交付；聊天回复和运行成功不代表已验收。';
        actionLabel = latestRun?.status === 'succeeded' && !latestRun.candidateDeliverableId
          ? '核对候选成果并交付' : '查看执行与提交交付';
    }
    return {
      id, title: task.title, status: labels[task.status], stage: stageFor[task.status],
      goal: task.goal, acceptanceCriteria: task.acceptanceCriteria, assignees,
      nextStep, actionLabel, href,
      ...(latestDelivery ? { latestDelivery: {
        revision: latestDelivery.revision, summary: latestDelivery.summary,
        status: latestDelivery.review
          ? latestDelivery.review.decision === 'accepted' ? '指定版本已验收' : '需修改'
          : '待人工验收',
      } } : {}),
      ...(latestRun ? { runStatus: runLabels[latestRun.status] } : {}),
    };
  });
  return {
    joinedMembers: conversation.members.filter(m => m.status === 'joined').length,
    invitedMembers: conversation.members.filter(m => m.status === 'invited').length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.stage === 'done').length,
    restrictedTasks: tasks.filter(t => t.stage === 'restricted').length,
    tasks,
  };
}
