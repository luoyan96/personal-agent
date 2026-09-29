import { describe, expect, it } from 'vitest';
import { fixtures } from '@research-agent-platform/contracts/fixtures';
import { taskCard } from '../src/collaboration-view';

describe('service task card presentation', () => {
  it('keeps a pending invitation distinct from a commitment and does not invent task status', () => {
    const task = fixtures.invitationSummary.schema.parse(fixtures.invitationSummary.value).data;
    const html = taskCard(task, id => id);
    expect(html).toContain('待回应邀请 · 尚未承诺');
    expect(html).toContain('可处理：回应邀请');
    expect(html).not.toContain('进行中');
    expect(html).not.toContain('可处理：认领');
  });
  it('renders cancelled tasks separately from completed without adding unavailable actions', () => {
    const task = fixtures.cancelledTask.schema.parse(fixtures.cancelledTask.value).data;
    const html = taskCard(task, id => id);
    expect(html).toContain('已取消');
    expect(html).not.toContain('已完成');
    expect(html).not.toContain('可处理：');
  });
  it('escapes task and member content in a navigable card', () => {
    const task = fixtures.claimSummary.schema.parse(fixtures.claimSummary.value).data;
    const html = taskCard({ ...task, title: '<img src=x onerror=alert(1)>', summary: '<script>private()</script>' }, () => '<b>name</b>');
    expect(html).toContain(`href="#/tasks/${task.id}"`);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;name');
    expect(html).not.toMatch(/<(img|script|b)[ >]/);
  });
});
