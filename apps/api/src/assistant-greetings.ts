import { AssistantProactiveSettings, QuietHours, Timezone, type ChatMessage, type RequestFor } from '@research-agent-platform/contracts'
import type { DatabaseSync } from 'node:sqlite'
import { relationshipReminder } from './assistant-relationship-memory.js'
import { ChatService } from './chat.js'
import { linkMessageReply } from './chat-message-actions.js'
import type { Config } from './config.js'
import { transaction } from './database.js'
import { ApiError, fail } from './errors.js'
import { serviceFor } from './execution-worker.js'
import { localInstant, parts } from './personal-time.js'

const defaultTimeZone = 'Asia/Shanghai'
const hour = 3_600_000
const minute = 60_000
const morning = { start: 9 * 60, end: 12 * 60 }
const afternoon = { start: 14 * 60, end: 17 * 60 }
const welcome = '你好呀，以后咱们一起做研究。'
const morningGreetings = [
  '早上好呀。',
  '早上好，祝你今天顺利。',
  '早上好。',
]

type LocalTime = ReturnType<typeof parts>
type Quiet = ReturnType<typeof QuietHours.parse>
type Policy = { mode: AssistantProactiveSettings['mode']; timeZone: string; quiet: Quiet | null }
type GreetingState = {
  member_id: string
  welcome_message_id: string
  device_time_zone: string | null
  last_greeting_date: string
  last_daily_at: string | null
}

const localMinute = (local: LocalTime) => local.hour * 60 + local.minute
const localDate = (local: LocalTime) => new Date(Date.UTC(local.year, local.month - 1, local.day)).toISOString().slice(0, 10)
const iso = (at: number) => new Date(at).toISOString()

function wallTime(local: LocalTime, day: number, minutes: number, timeZone: string) {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day + day))
  return localInstant({
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: Math.floor(minutes / 60), minute: minutes % 60,
  }, timeZone)
}

export function assistantProactiveSettings(db: DatabaseSync, memberId: string) {
  const row = db.prepare('SELECT mode,learn_from_chat,version FROM assistant_proactive_settings WHERE member_id=?').get(memberId)
  return AssistantProactiveSettings.parse({ mode: row?.mode ?? 'greeting', learnFromChat: row?.learn_from_chat === 1, version: row?.version ?? 1 })
}

export function updateAssistantProactiveSettings(chat: ChatService, body: RequestFor<'updateAssistantProactiveSettings'>['body']) {
  const memberId = chat.c.actor.id
  const current = assistantProactiveSettings(chat.db, memberId)
  chat.c.checkVersion(current.version, body.expectedVersion)
  const learnFromChat = body.learnFromChat ?? current.learnFromChat
  if (body.mode === current.mode && learnFromChat === current.learnFromChat) return current
  chat.db.prepare(`INSERT INTO assistant_proactive_settings(member_id,mode,learn_from_chat,version) VALUES (?,?,?,?)
    ON CONFLICT(member_id) DO UPDATE SET mode=excluded.mode,learn_from_chat=excluded.learn_from_chat,version=excluded.version`)
    .run(memberId, body.mode, learnFromChat ? 1 : 0, current.version + 1)
  if (body.mode !== current.mode) rescheduleAssistantGreeting(chat.db, memberId, chat.clock())
  return assistantProactiveSettings(chat.db, memberId)
}

function policyFor(db: DatabaseSync, memberId: string, deviceTimeZone: string | null): Policy {
  const settings = db.prepare('SELECT time_zone,version,quiet_hours_json FROM personal_memory_settings WHERE member_id=?').get(memberId)
  const accountTimeZone = settings && (Number(settings.version) > 1 || settings.time_zone !== defaultTimeZone)
    ? Timezone.safeParse(settings.time_zone).data : undefined
  return {
    mode: assistantProactiveSettings(db, memberId).mode,
    timeZone: accountTimeZone ?? deviceTimeZone ?? defaultTimeZone,
    quiet: settings?.quiet_hours_json ? QuietHours.parse(JSON.parse(String(settings.quiet_hours_json))) : null,
  }
}

function nextAllowedMinute(value: number, quiet: Quiet | null) {
  if (!quiet) return value
  const toMinute = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3))
  const start = toMinute(quiet.start), end = toMinute(quiet.end)
  if (start < end) return value >= start && value < end ? end : value
  if (value >= start) return 24 * 60
  return value < end ? end : value
}

function nextCheck(at: number, policy: Policy, state: Pick<GreetingState, 'last_greeting_date' | 'last_daily_at'>) {
  const { timeZone, mode, quiet } = policy
  const local = parts(at, timeZone)
  const earliestMorning = state.last_daily_at ? Math.max(at, Date.parse(state.last_daily_at) + 20 * hour) : at
  const morningLocal = parts(earliestMorning, timeZone)
  const windows = mode === 'contextual' ? [morning, afternoon] : [morning]
  for (let day = 0; day <= 2; day++) {
    const date = iso(Date.UTC(local.year, local.month - 1, local.day + day)).slice(0, 10)
    for (const window of windows) {
      const first = window === morning ? morningLocal : local
      const firstDate = localDate(first)
      if (date < firstDate || (window === morning && date <= state.last_greeting_date)) continue
      const firstMinute = date === firstDate ? localMinute(first) : 0
      const allowed = nextAllowedMinute(Math.max(window.start, firstMinute), quiet)
      if (allowed >= window.end) continue
      if (date === firstDate && allowed === firstMinute) return { at: window === morning ? earliestMorning : at, window }
      const candidate = wallTime(local, day, allowed, timeZone)
      if (candidate === null) return { at: at + 30 * minute, window: null }
      return { at: candidate, window }
    }
  }
  // A fully quiet day stays quiet. Re-evaluate once the next morning.
  return { at: wallTime(local, 1, morning.start, timeZone) ?? at + 30 * minute, window: null }
}

function privateConversation(chat: ChatService, conversationId: string, assistantId: string) {
  const conversation = chat.conversation(conversationId, false)
  const humanId = chat.human().id
  if (conversation.kind !== 'personal' || conversation.ownerMemberId !== chat.c.actor.id ||
    conversation.members.some(member => member.status === 'joined' && member.contactId !== assistantId && member.contactId !== humanId)) fail('FORBIDDEN')
  chat.joinedAgent(conversation, assistantId)
  return conversation
}

function sendGreeting(chat: ChatService, conversationId: string, assistantId: string, text: string) {
  return chat.message(conversationId, {
    senderContactId: assistantId, origin: 'service', text, mentions: [], resources: [], actionIds: [], turnId: null,
  })
}

export function authorizeProactiveDelivery(chat: ChatService, message: ChatMessage) {
  const stored = chat.db.prepare(`SELECT d.*,g.device_time_zone FROM assistant_proactive_deliveries d
    JOIN assistant_greetings g ON g.member_id=d.member_id WHERE d.message_id=?`).get(message.id)
  if (!stored) return
  const memberId = chat.c.actor.id
  if (stored.member_id !== memberId || !message.senderContactId) fail('FORBIDDEN')
  const policy = policyFor(chat.db, memberId, stored.device_time_zone as string | null)
  if (policy.mode === 'off') fail('FORBIDDEN')
  const at = chat.clock()
  const nowMinute = localMinute(parts(at, policy.timeZone))
  if (nextAllowedMinute(nowMinute, policy.quiet) !== nowMinute) fail('FORBIDDEN')
  const conversation = privateConversation(chat, message.conversationId, message.senderContactId)
  if (stored.context_key === null) return
  if (policy.mode !== 'contextual') fail('FORBIDDEN')
  const context = relationshipReminder(chat, conversation, message.senderContactId, at, key => key !== stored.context_key)
  if (!context || context.sourceMessageId !== stored.source_message_id) fail('FORBIDDEN')
}

/** Called during authenticated IM session provisioning, in the same write transaction. */
export function welcomeAssistantOwner(chat: ChatService, conversationId: string, assistantId: string, deviceZone: unknown) {
  const memberId = chat.c.actor.id
  const existing = chat.db.prepare('SELECT device_time_zone FROM assistant_greetings WHERE member_id=?').get(memberId)
  const deviceTimeZone = Timezone.safeParse(deviceZone).data ?? (existing?.device_time_zone as string | null | undefined) ?? null
  const at = chat.clock()
  if (existing) {
    if (deviceTimeZone !== existing.device_time_zone) {
      chat.db.prepare('UPDATE assistant_greetings SET device_time_zone=? WHERE member_id=?').run(deviceTimeZone, memberId)
      rescheduleAssistantGreeting(chat.db, memberId, at)
    }
    return
  }

  privateConversation(chat, conversationId, assistantId)
  const policy = policyFor(chat.db, memberId, deviceTimeZone)
  const date = localDate(parts(at, policy.timeZone))
  const message = sendGreeting(chat, conversationId, assistantId, welcome)
  chat.db.prepare(`INSERT INTO assistant_greetings(member_id,welcome_message_id,device_time_zone,last_greeting_date,next_daily_at)
    VALUES (?,?,?,?,?)`).run(memberId, message.id, deviceTimeZone, date, iso(nextCheck(at, policy, { last_greeting_date: date, last_daily_at: null }).at))
}

/** Called in the account settings transaction as well as on device timezone changes. */
export function rescheduleAssistantGreeting(db: DatabaseSync, memberId: string, at: number) {
  const row = db.prepare('SELECT * FROM assistant_greetings WHERE member_id=?').get(memberId) as GreetingState | undefined
  if (!row) return
  const policy = policyFor(db, memberId, row.device_time_zone)
  db.prepare('UPDATE assistant_greetings SET next_daily_at=? WHERE member_id=?').run(iso(nextCheck(at, policy, row).at), memberId)
}

function waitUntilIdle(chat: ChatService, conversationId: string, at: number) {
  const latest = chat.db.prepare(`SELECT json_extract(m.document,'$.createdAt') created_at FROM chat_messages m
    LEFT JOIN chat_message_retractions r ON r.message_id=m.id
    WHERE m.conversation_id=? AND json_extract(m.document,'$.origin')='human'
      AND json_extract(m.document,'$.senderContactId')=? AND r.message_id IS NULL
    ORDER BY m.sequence DESC LIMIT 1`).get(conversationId, chat.human().id)
  const busy = chat.db.prepare("SELECT 1 FROM chat_turns WHERE conversation_id=? AND owner_id=? AND status IN ('queued','running') LIMIT 1")
    .get(conversationId, chat.c.actor.id)
  return Math.max(at, latest ? Date.parse(String(latest.created_at)) + 2 * hour : at, busy ? at + 30 * minute : at)
}

function explicitReminderNearby(db: DatabaseSync, memberId: string, at: number) {
  // The existing reminder worker owns explicit schedules and their durable runs.
  return db.prepare(`SELECT 1 FROM personal_followups f
    WHERE f.member_id=? AND (
      (f.status='active' AND f.fired_message_id IS NULL AND f.next_at<=?) OR
      EXISTS(SELECT 1 FROM personal_followup_runs r JOIN chat_messages m ON m.id=COALESCE(r.notification_id,r.message_id)
        WHERE r.followup_id=f.id AND json_extract(m.document,'$.createdAt')>=?)
    ) LIMIT 1`).get(memberId, iso(at + 3 * hour), iso(at - 6 * hour))
}

function hasMatchingReminder(db: DatabaseSync, memberId: string, subject: string) {
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, '')
  const key = normalize(subject)
  return db.prepare(`SELECT json_extract(document,'$.title') title FROM personal_followups
    WHERE member_id=? AND status IN ('active','completed')`).all(memberId).some(row => normalize(String(row.title)) === key)
}

export class AssistantGreetingWorker {
  constructor(readonly db: DatabaseSync, readonly config: Config) {}

  async tick(at = Date.now()) {
    const due = this.db.prepare(`SELECT g.* FROM assistant_greetings g
      JOIN auth_accounts a ON a.member_id=g.member_id AND a.disabled=0
      LEFT JOIN assistant_proactive_settings p ON p.member_id=g.member_id
      WHERE g.next_daily_at<=? AND COALESCE(p.mode,'greeting')!='off'
      ORDER BY g.next_daily_at,g.member_id LIMIT 1`)
    const now = iso(at)
    if (!due.get(now)) return false

    return transaction(this.db, () => {
      const row = due.get(now) as GreetingState | undefined
      if (!row) return false
      const policy = policyFor(this.db, row.member_id, row.device_time_zone)
      const local = parts(at, policy.timeZone)
      const { at: checkAt, window } = nextCheck(at, policy, row)
      let nextAt = checkAt
      if (checkAt === at && window) {
        const result = this.dispatch(row, policy, at, window === morning)
        if (result.delivered && window === morning) {
          row.last_greeting_date = localDate(local)
          row.last_daily_at = now
        }
        const end = wallTime(local, 0, window.end, policy.timeZone) ?? at + (window.end - localMinute(local)) * minute
        nextAt = nextCheck(result.retryAt ?? end, policy, row).at
      }
      this.db.prepare('UPDATE assistant_greetings SET last_greeting_date=?,last_daily_at=?,next_daily_at=? WHERE member_id=?')
        .run(row.last_greeting_date, row.last_daily_at, iso(nextAt), row.member_id)
      return true
    })
  }

  private dispatch(row: GreetingState, policy: Policy, at: number, isMorning: boolean): { delivered?: boolean; retryAt?: number } {
    const target = this.db.prepare("SELECT conversation_id,json_extract(document,'$.senderContactId') assistant_id FROM chat_messages WHERE id=?")
      .get(row.welcome_message_id)
    if (!target) return {}
    const assistantId = String(target.assistant_id)
    const chat = new ChatService(serviceFor(this.db, row.member_id, this.config).c, this.config)
    let conversation
    try {
      conversation = privateConversation(chat, String(target.conversation_id), assistantId)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      return {}
    }

    const local = parts(at, policy.timeZone)
    const date = localDate(local)
    const record = this.db.prepare(`INSERT INTO assistant_proactive_deliveries(member_id,context_key,local_date,recorded_at,source_message_id,message_id)
      VALUES (?,?,?,?,?,?)`)
    if (policy.mode === 'contextual') {
      const idleAt = waitUntilIdle(chat, conversation.id, at)
      if (idleAt > at) return { retryAt: idleAt }
      if (explicitReminderNearby(this.db, row.member_id, at)) return {}
      const seen = this.db.prepare('SELECT 1 FROM assistant_proactive_deliveries WHERE member_id=? AND context_key=?')
      const recent = this.db.prepare('SELECT 1 FROM assistant_proactive_deliveries WHERE member_id=? AND context_key IS NOT NULL AND (local_date=? OR recorded_at>?)')
        .get(row.member_id, date, iso(at - 20 * hour))
      if (recent && !isMorning) return {}
      const context = recent ? undefined : relationshipReminder(chat, conversation, assistantId, at, key => !!seen.get(row.member_id, key))
      if (context && !hasMatchingReminder(this.db, row.member_id, context.subject)) {
        const question = `要接着聊「${context.subject}」吗？`
        const message = sendGreeting(chat, conversation.id, assistantId, isMorning ? `早上好。${question}` : question)
        linkMessageReply(chat, message.id, context.sourceMessageId)
        record.run(row.member_id, context.key, date, iso(at), context.sourceMessageId, message.id)
        return { delivered: true }
      }
      if (!isMorning) return { retryAt: at + hour }
    }
    const day = Date.parse(date) / (24 * hour)
    const message = sendGreeting(chat, conversation.id, assistantId, morningGreetings[day % morningGreetings.length]!)
    record.run(row.member_id, null, date, iso(at), null, message.id)
    return { delivered: true }
  }
}
