import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { Assignment, Deliverable, Member, Plan, Task, TaskEvent, TaskSummary, routes } from '@research-agent-platform/contracts'
import type { AssignmentModel, DeliverableModel, PlanModel, RequestFor, RouteName, ScheduleModel, TaskModel } from '@research-agent-platform/contracts'
import { hash, signingKey } from './auth.js'
import type { Actor } from './auth.js'
import { fail } from './errors.js'

const now = () => new Date().toISOString()
const id = () => randomUUID()
const encode = (value: unknown) => JSON.stringify(value)
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value)
}
export const b1Commands = ['me', 'members', 'createPlan', 'getPlan', 'editPlan', 'confirmPlan', 'tasks', 'task', 'invite', 'invitationDecision', 'claim', 'start', 'submit', 'review'] as const satisfies readonly RouteName[]
export type B1Command = typeof b1Commands[number]
type Handlers = { [K in B1Command]: (request: RequestFor<K>) => unknown }

export class Collaboration {
  constructor(readonly db: DatabaseSync, readonly actor: Actor) {}
  sameLab(labId: string) { if (this.actor.labId !== labId) fail('NOT_FOUND') }
  checkVersion(actual: number, expected: number) { if (actual !== expected) fail('VERSION_CONFLICT') }
  revision() { return String(this.db.prepare("SELECT value FROM runtime_meta WHERE key='revision'").get()!.value) }
  changed() { this.db.exec("UPDATE runtime_meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision'") }
  plan(planId: string): PlanModel {
    const row = this.db.prepare('SELECT document FROM plans WHERE id=? AND owner_id=? AND lab_id=?').get(planId, this.actor.id, this.actor.labId)
    if (!row) fail('NOT_FOUND')
    return Plan.parse(JSON.parse(String(row.document)))
  }
  taskRow(taskId: string) {
    // Determine access from relational metadata before loading private task JSON.
    const row = this.db.prepare(`SELECT t.id,t.lab_id,t.initiator_id,t.lead_id,t.reviewer_id,t.status,t.claimable,t.version,t.created_at,a.access
      FROM tasks t LEFT JOIN task_access a ON a.task_id=t.id AND a.member_id=? WHERE t.id=? AND t.lab_id=?`).get(this.actor.id, taskId, this.actor.labId)
    if (!row || row.access === 'revoked') fail('NOT_FOUND')
    return row
  }
  access(taskId: string): 'full' | 'summary' {
    const row = this.taskRow(taskId)
    if (row.access === 'full') return 'full'
    if (row.claimable === 1 || this.db.prepare("SELECT id FROM assignments WHERE task_id=? AND member_id=? AND status='pending'").get(taskId, this.actor.id)) return 'summary'
    fail('NOT_FOUND')
  }
  task(taskId: string): TaskModel {
    if (this.access(taskId) !== 'full') fail('FORBIDDEN')
    return Task.parse(JSON.parse(String(this.db.prepare('SELECT document FROM tasks WHERE id=?').get(taskId)!.document)))
  }
  assignment(assignmentId: string) {
    const metadata = this.db.prepare('SELECT task_id,member_id FROM assignments WHERE id=?').get(assignmentId)
    if (!metadata) fail('NOT_FOUND')
    this.taskRow(String(metadata.task_id))
    if (metadata.member_id !== this.actor.id && this.access(String(metadata.task_id)) !== 'full') fail('NOT_FOUND')
    const row = this.db.prepare('SELECT document,offer_scope,offer_schedule FROM assignments WHERE id=?').get(assignmentId)!
    return { model: Assignment.parse(JSON.parse(String(row.document))), scope: String(row.offer_scope), schedule: JSON.parse(String(row.offer_schedule)) as ScheduleModel }
  }
  deliverable(deliverableId: string): DeliverableModel {
    const metadata = this.db.prepare('SELECT task_id FROM deliverables WHERE id=?').get(deliverableId)
    if (!metadata) fail('NOT_FOUND')
    this.task(String(metadata.task_id))
    const row = this.db.prepare('SELECT document FROM deliverables WHERE id=?').get(deliverableId)!
    return Deliverable.parse(JSON.parse(String(row.document)))
  }
  member(memberId: string) {
    const row = this.db.prepare('SELECT id,lab_id,display_name,version FROM members WHERE id=? AND lab_id=?').get(memberId, this.actor.labId)
    if (!row) fail('NOT_FOUND')
    const commitments = this.db.prepare(`SELECT a.document FROM assignments a JOIN tasks t ON t.id=a.task_id
      JOIN task_access acl ON acl.task_id=t.id AND acl.member_id=? AND acl.access='full'
      WHERE a.member_id=? AND a.status='accepted' AND t.status NOT IN ('completed','cancelled') ORDER BY t.id LIMIT 100`).all(this.actor.id, memberId)
      .map(r => Assignment.parse(JSON.parse(String(r.document)))).map(a => ({ taskId: a.taskId, scope: a.commitment!.scope, schedule: a.commitment!.schedule }))
    return Member.parse({ id: row.id, labId: row.lab_id, displayName: row.display_name, version: row.version, publicExpertise: [], availability: null, visibleCommitments: commitments })
  }
  actions(task: TaskModel): TaskModel {
    const allowedActions: TaskModel['allowedActions'] = []
    if (!task.leadId && task.status === 'awaiting_acceptance' && this.taskRow(task.id).claimable === 1) allowedActions.push('claim')
    if (task.initiatorId === this.actor.id && ['unassigned', 'awaiting_acceptance'].includes(task.status) && !this.db.prepare("SELECT id FROM assignments WHERE task_id=? AND status IN ('pending','accepted')").get(task.id)) allowedActions.push('invite')
    if (task.leadId === this.actor.id) {
      if (['ready', 'changes_requested'].includes(task.status)) allowedActions.push('start')
      if (['in_progress', 'changes_requested'].includes(task.status)) allowedActions.push('submit')
    }
    if (task.reviewerId === this.actor.id && task.status === 'in_review') allowedActions.push('review')
    return { ...task, allowedActions }
  }
  projection(taskId: string, detail: boolean): unknown {
    if (this.access(taskId) === 'summary') {
      const row = this.db.prepare('SELECT summary_document,version,lead_id,status,claimable FROM tasks WHERE id=?').get(taskId)!
      const invitation = this.db.prepare("SELECT id,version,offer_scope,offer_schedule FROM assignments WHERE task_id=? AND member_id=? AND status='pending'").get(taskId, this.actor.id)
      return TaskSummary.parse({ ...JSON.parse(String(row.summary_document)), version: row.version,
        allowedActions: invitation ? ['decide'] : row.claimable === 1 && row.lead_id === null && row.status === 'awaiting_acceptance' ? ['claim'] : [],
        pendingInvitation: invitation ? { id: invitation.id, version: invitation.version, scope: invitation.offer_scope, schedule: JSON.parse(String(invitation.offer_schedule)) } : null })
    }
    const task = this.actions(this.task(taskId))
    if (!detail) return task
    return { task, assignments: this.db.prepare('SELECT document FROM assignments WHERE task_id=? ORDER BY id').all(taskId).map(r => Assignment.parse(JSON.parse(String(r.document)))),
      deliverables: this.db.prepare('SELECT document FROM deliverables WHERE task_id=? ORDER BY revision').all(taskId).map(r => Deliverable.parse(JSON.parse(String(r.document)))), executions: [] }
  }
  savePlan(plan: PlanModel) {
    Plan.parse(plan)
    this.db.prepare('INSERT INTO plans VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,document=excluded.document').run(plan.id, plan.labId, plan.ownerId, plan.version, encode(plan))
    this.db.prepare('INSERT INTO plan_versions VALUES (?,?,?)').run(plan.id, plan.version, encode(plan))
  }
  saveTask(task: TaskModel) {
    task.allowedActions = []
    Task.parse(task)
    this.db.prepare('UPDATE tasks SET lead_id=?,status=?,version=?,document=? WHERE id=?').run(task.leadId, task.status, task.version, encode(task), task.id)
  }
  saveAssignment(a: AssignmentModel) {
    Assignment.parse(a)
    this.db.prepare('UPDATE assignments SET status=?,version=?,document=? WHERE id=?').run(a.status, a.version, encode(a), a.id)
  }
  event(task: TaskModel, kind: string) {
    const event = TaskEvent.parse({ id: id(), taskId: task.id, actor: { kind: 'member', memberId: this.actor.id }, kind, resourceVersion: task.version, timestamp: now(), summary: `Task ${kind}` })
    this.db.prepare('INSERT INTO task_events(id,task_id,document) VALUES (?,?,?)').run(event.id, task.id, encode(event))
  }
  outbox(task: TaskModel, kind: string) {
    this.db.prepare('INSERT INTO outbox(id,dedup_key,aggregate_id,aggregate_version,kind,payload_json,available_at,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id(), `${task.id}:${task.version}:${kind}`, task.id, task.version, kind, encode({ taskId: task.id }), now(), now())
  }
  grant(taskId: string, memberId: string, access: 'full' | 'summary') {
    this.db.prepare('INSERT INTO task_access VALUES (?,?,?) ON CONFLICT(task_id,member_id) DO UPDATE SET access=excluded.access').run(taskId, memberId, access)
  }
  validateSchedule(schedule: ScheduleModel) {
    if (schedule.committed !== null) fail('VALIDATION_ERROR')
    if (schedule.hardDeadline && (!schedule.hardDeadline.confirmed || !['user', 'authorized_material'].includes(schedule.hardDeadline.source))) fail('VALIDATION_ERROR')
  }
  validatePlan(plan: RequestFor<'createPlan'>['body']) {
    this.sameLab(plan.labId)
    const ids = new Set(plan.proposedItems.map(item => item.id))
    if (ids.size !== plan.proposedItems.length) fail('VALIDATION_ERROR')
    for (const item of plan.proposedItems) {
      this.validateSchedule(item.schedule)
      if (item.inputArtifactIds.length) fail('NOT_IMPLEMENTED')
      if (item.allocation.kind === 'invitation') {
        this.member(item.allocation.memberId)
        if (item.allocation.memberId === this.actor.id) fail('VALIDATION_ERROR')
      }
      if (item.dependencies.some(dependency => !ids.has(dependency))) fail('VALIDATION_ERROR')
    }
    const visiting = new Set<string>(), visited = new Set<string>()
    const visit = (itemId: string) => {
      if (visiting.has(itemId)) fail('VALIDATION_ERROR')
      if (visited.has(itemId)) return
      visiting.add(itemId)
      for (const next of plan.proposedItems.find(i => i.id === itemId)!.dependencies) visit(next)
      visiting.delete(itemId); visited.add(itemId)
    }
    for (const itemId of ids) visit(itemId)
  }
  authorize(name: B1Command, resourceId: string, body: unknown) {
    if (name === 'createPlan') { this.sameLab((body as RequestFor<'createPlan'>['body']).labId); return }
    if (['editPlan', 'confirmPlan', 'getPlan'].includes(name)) { this.plan(resourceId); return }
    if (name === 'invitationDecision') {
      const { model } = this.assignment(resourceId)
      if (model.memberId !== this.actor.id) fail('NOT_FOUND')
      return
    }
    if (name === 'review') {
      const delivery = this.deliverable(resourceId)
      if (this.task(delivery.taskId).reviewerId !== this.actor.id) fail('FORBIDDEN')
      return
    }
    if (name === 'claim') { const row = this.taskRow(resourceId); if (row.claimable !== 1) fail('NOT_FOUND'); return }
    if (['invite', 'start', 'submit'].includes(name)) {
      const task = this.task(resourceId)
      if (name === 'invite' ? task.initiatorId !== this.actor.id : task.leadId !== this.actor.id) fail('FORBIDDEN')
    }
  }
  run<K extends B1Command>(name: K, request: RequestFor<K>): unknown {
    const route = routes[name]
    const params = request.params as { id?: string }
    const resource = params.id ?? this.actor.labId
    // Must run inside caller's transaction, after authenticating the current session.
    this.authorize(name, resource, request.body)
    const key = (request.headers as { 'Idempotency-Key'?: string })['Idempotency-Key']
    const requestHash = hash(canonical(request))
    if (route.idempotent) {
      const cached = this.db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(this.actor.id, name, resource, key!)
      if (cached) {
        if (cached.request_hash !== requestHash) fail('IDEMPOTENCY_CONFLICT')
        return route.response.parse(JSON.parse(String(cached.response_json)))
      }
    }
    const response = (this.handlers[name] as (r: RequestFor<K>) => unknown)(request)
    // Validate before commit so an invalid response cannot leave committed effects.
    const validated = route.response.parse(response)
    if (route.idempotent) {
      this.db.prepare('INSERT INTO idempotency_results VALUES (?,?,?,?,?,?,?,?)').run(this.actor.id, name, resource, key!, requestHash, encode(validated), route.status, now())
      this.changed()
    }
    return validated
  }
  cursor(query: unknown, cursor: string | undefined): { last: string; created: string } | null {
    if (!cursor) return null
    try {
      const [payload, signature] = cursor.split('.')
      if (!payload || !signature || !/^[a-f0-9]{64}$/.test(signature)) fail('CURSOR_EXPIRED')
      const expected = createHmac('sha256', signingKey(this.db)).update(`cursor:${payload}`).digest()
      if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) fail('CURSOR_EXPIRED')
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { actor: string; query: string; revision: string; expires: number; last: string; created: string }
      if (data.actor !== this.actor.id || data.query !== canonical(query) || data.revision !== this.revision() || data.expires < Date.now() || typeof data.last !== 'string' || typeof data.created !== 'string') fail('CURSOR_EXPIRED')
      return data
    } catch { fail('CURSOR_EXPIRED') }
  }
  nextCursor(query: unknown, last: string, created = '') {
    const payload = Buffer.from(encode({ actor: this.actor.id, query: canonical(query), revision: this.revision(), expires: Date.now() + 900000, last, created })).toString('base64url')
    return `${payload}.${createHmac('sha256', signingKey(this.db)).update(`cursor:${payload}`).digest('hex')}`
  }
  createAssignment(task: TaskModel, kind: 'self' | 'invitation' | 'claim', memberId: string, scope: string, schedule: ScheduleModel) {
    const accepted = kind !== 'invitation'
    const assignment = Assignment.parse({ id: id(), taskId: task.id, kind, memberId, capability: null, status: accepted ? 'accepted' : 'pending', commitment: accepted ? { scope, schedule, acceptedAt: now() } : null, transferToMemberId: null, version: 1 })
    this.db.prepare('INSERT INTO assignments VALUES (?,?,?,?,?,?,?,?,?)').run(assignment.id, task.id, memberId, kind, assignment.status, 1, encode(assignment), scope, encode(schedule))
    this.grant(task.id, memberId, accepted ? 'full' : 'summary')
    return assignment
  }
  readonly handlers: Handlers = {
    me: () => ({ data: this.member(this.actor.id) }),
    members: ({ params, query }) => {
      this.sameLab(params.id)
      const base = { kind: 'members', labId: params.id, limit: query.limit ?? 30 }
      const cursor = this.cursor(base, query.cursor)
      const rows = this.db.prepare('SELECT id FROM members WHERE lab_id=? AND id>? ORDER BY id LIMIT ?').all(params.id, cursor?.last ?? '', base.limit + 1)
      return { data: rows.slice(0, base.limit).map(r => this.member(String(r.id))), nextCursor: rows.length > base.limit ? this.nextCursor(base, String(rows[base.limit - 1]!.id)) : null }
    },
    createPlan: ({ body }) => {
      this.validatePlan(body)
      const plan = Plan.parse({ ...body, id: id(), ownerId: this.actor.id, version: 1, status: 'draft', createdAt: now() })
      this.savePlan(plan); return { data: plan }
    },
    getPlan: ({ params }) => ({ data: this.plan(params.id) }),
    editPlan: ({ params, body }) => {
      const plan = this.plan(params.id); this.checkVersion(plan.version, body.expectedVersion)
      if (plan.status !== 'draft') fail('INVALID_STATE')
      this.validatePlan(body)
      if (body.labId !== plan.labId) fail('VALIDATION_ERROR')
      const { expectedVersion: _, ...input } = body
      const updated = { ...plan, ...input, version: plan.version + 1 }
      this.savePlan(updated); return { data: updated }
    },
    confirmPlan: ({ params, body }) => {
      const plan = this.plan(params.id); this.checkVersion(plan.version, body.expectedVersion)
      if (plan.status !== 'draft') fail('INVALID_STATE')
      this.validatePlan(plan)
      if (!plan.proposedItems.length) fail('VALIDATION_ERROR')
      if (plan.proposedItems.some(item => item.allocation.kind === 'public_agent')) fail('CAPABILITY_UNAVAILABLE')
      const mapping = new Map(plan.proposedItems.map(item => [item.id, id()]))
      for (const item of plan.proposedItems) {
        const own = item.allocation.kind === 'self'
        const task = Task.parse({ id: mapping.get(item.id), labId: plan.labId, parentTaskId: null, planId: plan.id, planVersion: plan.version, title: item.title, taskType: 'other', goal: item.goal, acceptanceCriteria: item.acceptanceCriteria, initiatorId: this.actor.id, leadId: own ? this.actor.id : null, reviewerId: this.actor.id, participantIds: [], status: own ? 'ready' : 'awaiting_acceptance', blocker: null, dependencies: item.dependencies.map(dependency => ({ taskId: mapping.get(dependency), kind: 'accepted_deliverable', requiredRevision: null })), schedule: item.schedule, access: { visibility: item.allocation.kind === 'claim' ? 'lab_summary' : 'participants', summary: item.allocation.kind === 'claim' ? item.allocation.summary : null }, version: 1, createdAt: now(), updatedAt: now(), allowedActions: [] })
        const summary = TaskSummary.parse({ projection: 'claim_summary', id: task.id, labId: task.labId, title: item.title, summary: item.allocation.kind === 'claim' ? item.allocation.summary : item.deliverable, deliverable: item.deliverable, acceptanceCriteria: item.acceptanceCriteria, schedule: item.schedule, initiatorId: task.initiatorId, reviewerId: task.reviewerId, version: 1, allowedActions: [], pendingInvitation: null })
        this.db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(task.id, task.labId, plan.id, item.id, task.initiatorId, task.leadId, task.reviewerId, task.status, item.allocation.kind === 'claim' ? 1 : 0, 1, task.createdAt, encode(task), encode(summary))
        this.grant(task.id, this.actor.id, 'full')
        if (own) this.createAssignment(task, 'self', this.actor.id, item.deliverable, item.schedule)
        if (item.allocation.kind === 'invitation') { this.createAssignment(task, 'invitation', item.allocation.memberId, item.deliverable, item.schedule); this.outbox(task, 'invitation_created') }
        this.event(task, 'confirmed')
      }
      plan.status = 'confirmed'; plan.version++; this.savePlan(plan)
      return { data: { plan, taskIds: [...mapping.values()] } }
    },
    tasks: ({ query }) => {
      this.sameLab(query.labId)
      const { cursor: cursorString, ...filter } = query
      const base = { kind: 'tasks', ...filter, limit: query.limit ?? 30 }
      const cursor = this.cursor(base, cursorString)
      const rows = this.db.prepare(`SELECT t.id,t.created_at FROM tasks t LEFT JOIN task_access acl ON acl.task_id=t.id AND acl.member_id=?
        WHERE t.lab_id=? AND COALESCE(acl.access,'')!='revoked'
        AND (acl.access='full' OR t.claimable=1 OR EXISTS(SELECT 1 FROM assignments a WHERE a.task_id=t.id AND a.member_id=? AND a.status='pending'))
        AND (?='lab' OR t.initiator_id=? OR t.lead_id=? OR t.reviewer_id=? OR EXISTS(SELECT 1 FROM assignments a WHERE a.task_id=t.id AND a.member_id=? AND a.status='pending'))
        AND (? IS NULL OR t.status=?) AND (? IS NULL OR t.created_at<? OR (t.created_at=? AND t.id<?))
        ORDER BY t.created_at DESC,t.id DESC LIMIT ?`).all(this.actor.id, query.labId, this.actor.id, query.scope, this.actor.id, this.actor.id, this.actor.id, this.actor.id, query.status ?? null, query.status ?? null, cursor?.last ?? null, cursor?.created ?? '', cursor?.created ?? '', cursor?.last ?? '', base.limit + 1)
      const last = rows[base.limit - 1]
      return { data: rows.slice(0, base.limit).map(row => this.projection(String(row.id), false)), nextCursor: rows.length > base.limit ? this.nextCursor(base, String(last!.id), String(last!.created_at)) : null }
    },
    task: ({ params }) => ({ data: this.projection(params.id, true) }),
    invite: ({ params, body }) => {
      const task = this.task(params.id); this.checkVersion(task.version, body.expectedVersion)
      if (!['unassigned', 'awaiting_acceptance'].includes(task.status) || task.leadId || this.db.prepare("SELECT id FROM assignments WHERE task_id=? AND status IN ('pending','accepted')").get(task.id)) fail('INVALID_STATE')
      if (Number(this.db.prepare('SELECT count(*) n FROM assignments WHERE task_id=?').get(task.id)?.n) >= 100) fail('VALIDATION_ERROR')
      this.member(body.memberId); this.validateSchedule(body.schedule)
      if (body.memberId === this.actor.id) fail('VALIDATION_ERROR')
      if (this.db.prepare("SELECT 1 FROM task_access WHERE task_id=? AND member_id=? AND access='revoked'").get(task.id, body.memberId)) fail('FORBIDDEN')
      const assignment = this.createAssignment(task, 'invitation', body.memberId, body.scope, body.schedule)
      task.status = 'awaiting_acceptance'; task.version++; task.updatedAt = now(); this.saveTask(task)
      // Switch off open claims while a specific invitation is pending.
      this.db.prepare('UPDATE tasks SET claimable=0 WHERE id=?').run(task.id)
      this.event(task, 'invited'); this.outbox(task, 'invitation_created')
      return { data: assignment }
    },
    invitationDecision: ({ params, body }) => {
      const offer = this.assignment(params.id), assignment = offer.model
      this.checkVersion(assignment.version, body.expectedVersion)
      const row = this.taskRow(assignment.taskId); this.checkVersion(Number(row.version), body.expectedTaskVersion)
      if (assignment.status !== 'pending' || row.status !== 'awaiting_acceptance' || row.lead_id) fail('INVALID_STATE')
      const task = Task.parse(JSON.parse(String(this.db.prepare('SELECT document FROM tasks WHERE id=?').get(assignment.taskId)!.document)))
      this.db.prepare('INSERT INTO invitation_decisions VALUES (?,?,?,?,?,?,?)').run(assignment.id, this.actor.id, assignment.version, task.version, body.decision, body.comment, now())
      assignment.status = body.decision; assignment.version++
      if (body.decision === 'accepted') {
        assignment.commitment = { scope: offer.scope, schedule: offer.schedule, acceptedAt: now() }
        task.leadId = this.actor.id; task.status = 'ready'; task.schedule = offer.schedule; this.grant(task.id, this.actor.id, 'full')
      } else { task.status = 'unassigned'; this.db.prepare("DELETE FROM task_access WHERE task_id=? AND member_id=? AND access='summary'").run(task.id, this.actor.id) }
      this.saveAssignment(assignment); task.version++; task.updatedAt = now(); this.saveTask(task); this.event(task, body.decision)
      return { data: assignment }
    },
    claim: ({ params, body }) => {
      const row = this.taskRow(params.id)
      if (row.lead_id || this.db.prepare("SELECT id FROM assignments WHERE task_id=? AND status='accepted'").get(params.id)) fail('ALREADY_CLAIMED')
      this.checkVersion(Number(row.version), body.expectedVersion)
      if (row.status !== 'awaiting_acceptance' || this.db.prepare("SELECT id FROM assignments WHERE task_id=? AND status='pending'").get(params.id)) fail('INVALID_STATE')
      const task = Task.parse(JSON.parse(String(this.db.prepare('SELECT document FROM tasks WHERE id=?').get(params.id)!.document)))
      const summary = TaskSummary.parse(JSON.parse(String(this.db.prepare('SELECT summary_document FROM tasks WHERE id=?').get(task.id)!.summary_document)))
      const assignment = this.createAssignment(task, 'claim', this.actor.id, summary.deliverable, summary.schedule)
      task.leadId = this.actor.id; task.status = 'ready'; task.version++; task.updatedAt = now(); this.saveTask(task); this.event(task, 'claimed')
      return { data: assignment }
    },
    start: ({ params, body }) => {
      const task = this.task(params.id); this.checkVersion(task.version, body.expectedVersion)
      if (!['ready', 'changes_requested'].includes(task.status)) fail('INVALID_STATE')
      for (const dependency of task.dependencies) if (!this.db.prepare("SELECT id FROM tasks WHERE id=? AND status='completed'").get(dependency.taskId)) fail('DEPENDENCY_BLOCKED')
      task.status = 'in_progress'; task.version++; task.updatedAt = now(); this.saveTask(task); this.event(task, 'started')
      return { data: this.actions(task) }
    },
    submit: ({ params, body }) => {
      const task = this.task(params.id); this.checkVersion(task.version, body.expectedVersion)
      if (!['in_progress', 'changes_requested'].includes(task.status)) fail('INVALID_STATE')
      if (body.artifactRefs.length || body.sources.some(source => source.kind === 'artifact')) fail('NOT_IMPLEMENTED')
      const revision = Number(this.db.prepare('SELECT COALESCE(MAX(revision),0)+1 n FROM deliverables WHERE task_id=?').get(task.id)!.n)
      if (revision > 100) fail('VALIDATION_ERROR')
      const delivery = Deliverable.parse({ id: id(), taskId: task.id, revision, submittedBy: this.actor.id, artifactRefs: [], summary: body.summary, sources: body.sources, submittedAt: now(), review: null, version: 1 })
      this.db.prepare('INSERT INTO deliverables VALUES (?,?,?,?,?)').run(delivery.id, task.id, revision, 1, encode(delivery))
      task.status = 'in_review'; task.version++; task.updatedAt = now(); this.saveTask(task); this.event(task, 'submitted')
      return { data: delivery }
    },
    review: ({ params, body }) => {
      const delivery = this.deliverable(params.id), task = this.task(delivery.taskId)
      this.checkVersion(delivery.version, body.expectedVersion); this.checkVersion(task.version, body.expectedTaskVersion)
      this.checkVersion(delivery.revision, body.revision)
      const latest = Number(this.db.prepare('SELECT MAX(revision) n FROM deliverables WHERE task_id=?').get(task.id)!.n)
      if (delivery.revision !== latest || task.status !== 'in_review' || delivery.review) fail('INVALID_STATE')
      delivery.review = { decision: body.decision, reviewerId: this.actor.id, revision: body.revision, comment: body.comment, at: now() }; delivery.version++
      this.db.prepare('INSERT INTO reviews VALUES (?,?,?,?)').run(delivery.id, delivery.revision, this.actor.id, encode(delivery.review))
      this.db.prepare('UPDATE deliverables SET version=?,document=? WHERE id=?').run(delivery.version, encode(delivery), delivery.id)
      task.status = body.decision === 'accepted' ? 'completed' : 'changes_requested'; task.version++; task.updatedAt = now(); this.saveTask(task); this.event(task, 'reviewed')
      return { data: delivery }
    },
  }
}

