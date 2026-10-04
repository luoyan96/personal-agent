import { describe, it, expect } from 'vitest';
import { Task, Assignment, Conversation, Deliverable, routes } from '@research-agent-platform/contracts';
import type { ResponseFor, TaskModel } from '@research-agent-platform/contracts';
import { fixtures, endpointExamples, unknownSchedule } from '@research-agent-platform/contracts/fixtures';
import { projectConversationWorkflow } from '../src/chat-workflow';

type Detail = Extract<ResponseFor<'task'>['data'], { task: unknown }>;
const at = '2026-10-04T00:00:00Z';
const base = Task.parse(fixtures.serviceProgressReply.value.data.tasks[0]);
const group = Conversation.parse({
  id: 'group_synthetic', labId: base.labId, kind: 'group', title: '合成任务群', ownerMemberId: 'member_A', version: 1,
  members: [{ contactId: 'human_A', role: 'owner', status: 'joined', version: 1 },
    { contactId: 'human_B', role: 'member', status: 'invited', version: 1 }],
  taskIds: [base.id], lastSequence: 0, createdAt: at, updatedAt: at, allowedActions: ['send'],
});
const members = [{ id: 'member_B', displayName: '合成承接者' }];
function detail(status: TaskModel['status'], id = base.id): Detail {
  return { task: Task.parse({ ...base, id, status, blocker: status === 'blocked' ? base.blocker : null }),
    assignments: [], deliverables: [], executions: [] };
}
function project(data: Detail) { return projectConversationWorkflow(group, new Map([[base.id, data]]), [], members)!; }

describe('authorized conversation workflow facts', () => {
  it('does not treat group membership or pending invitations as task commitments', () => {
    const data = detail('awaiting_acceptance');
    data.assignments = [Assignment.parse({ id: 'pending_B', taskId: base.id, kind: 'invitation', memberId: 'member_B',
      capability: null, status: 'pending', commitment: null, transferToMemberId: null, version: 1 })];
    const before = project(data);
    expect(before.joinedMembers).toBe(1); expect(before.invitedMembers).toBe(1);
    expect(before.tasks[0]?.assignees).toEqual([]); expect(before.tasks[0]?.stage).toBe('accept');
    data.assignments[0] = Assignment.parse({ ...data.assignments[0], status: 'accepted',
      commitment: { scope: '仅核对合成材料', schedule: unknownSchedule, acceptedAt: at } });
    expect(project(data).tasks[0]?.assignees).toEqual(['合成承接者']);
  });

  it('keeps successful execution and older accepted deliveries distinct from current acceptance', () => {
    const data = detail('in_progress');
    const run = routes.getRun.response.parse(endpointExamples.getRun!.response).data;
    data.executions = [{ ...run, taskId: base.id, status: 'succeeded', candidateDeliverableId: null }];
    const executing = project(data);
    expect(executing.completedTasks).toBe(0); expect(executing.tasks[0]?.stage).toBe('work');
    expect(executing.tasks[0]?.nextStep).toContain('候选成果');
    data.task = Task.parse({ ...data.task, status: 'in_review' });
    const delivery = Deliverable.parse({ id: 'delivery_old', taskId: base.id, revision: 1, submittedBy: 'member_B',
      artifactRefs: [], summary: '旧交付', sources: [], submittedAt: at, version: 1,
      review: { decision: 'accepted', reviewerId: 'member_A', revision: 1, comment: '旧版本通过', at } });
    data.deliverables = [Deliverable.parse({ ...delivery, id: 'delivery_new', revision: 2, summary: '新交付待审', review: null }), delivery];
    const review = project(data);
    expect(review.completedTasks).toBe(0); expect(review.tasks[0]?.stage).toBe('review');
    expect(review.tasks[0]?.latestDelivery).toEqual({ revision: 2, status: '待人工验收', summary: '新交付待审' });
  });

  it('shows blocked and rework next steps without advancing the task stage', () => {
    const blocked = project(detail('blocked')).tasks[0]!;
    expect(blocked.stage).toBe('work'); expect(blocked.nextStep).toContain(base.blocker!.reason);
    expect(blocked.nextStep).toContain(base.blocker!.requestedAction);
    const rework = project(detail('changes_requested')).tasks[0]!;
    expect(rework.status).toBe('需修改'); expect(rework.nextStep).toContain('新交付版本');
  });

  it('limits facts to linked authorized tasks and preserves restricted summaries', () => {
    const summary = fixtures.invitationSummary.value.data;
    const limitedGroup = Conversation.parse({ ...group, taskIds: [summary.id, 'task_not_authorized'] });
    const data = new Map<string, ResponseFor<'task'>['data']>([[summary.id, summary],
      ['unrelated_private_task', detail('completed', 'unrelated_private_task')]]);
    const projected = projectConversationWorkflow(limitedGroup, data, [], members)!;
    expect(projected.totalTasks).toBe(2); expect(projected.completedTasks).toBe(0); expect(projected.restrictedTasks).toBe(2);
    expect(projected.tasks[0]?.assignees).toEqual([]); expect(projected.tasks[0]?.actionLabel).toBe('查看并回应邀请');
    expect(projected.tasks[1]?.href).toBe(''); expect(JSON.stringify(projected)).not.toContain('unrelated_private_task');
    data.set(summary.id, { ...summary, visibleStatus: 'completed', pendingInvitation: null, allowedActions: [] });
    const completedSummary = projectConversationWorkflow(limitedGroup, data, [], members)!;
    expect(completedSummary.completedTasks).toBe(1);
    expect(completedSummary.tasks[0]?.status).toBe('已完成 · 仅摘要');
    expect(completedSummary.tasks[0]?.stage).toBe('restricted');
  });

  it('counts completed and cancelled tasks separately in mixed-progress groups', () => {
    const multi = Conversation.parse({ ...group, taskIds: ['task_done', 'task_cancelled', 'task_active'] });
    const data = new Map(['task_done', 'task_cancelled', 'task_active'].map((id, i) =>
      [id, detail((['completed', 'cancelled', 'in_progress'] as const)[i]!, id)]));
    const projected = projectConversationWorkflow(multi, data, [], members)!;
    expect(projected.completedTasks).toBe(1); expect(projected.tasks.map(t => t.stage)).toEqual(['done', 'cancelled', 'work']);
    expect(projectConversationWorkflow(Conversation.parse({ ...group, kind: 'personal' }), data, [], members)).toBeUndefined();
  });
});
