import { Timezone } from '@research-agent-platform/contracts'
import type { DatabaseSync } from 'node:sqlite'
import { ChatService } from './chat.js'
import type { Config } from './config.js'
import { transaction } from './database.js'
import { fail } from './errors.js'
import { serviceFor } from './execution-worker.js'
import { localInstant, parts } from './personal-time.js'

const defaultTimeZone = 'Asia/Shanghai'
const morningHour = 9
const morningEndHour = 12
const welcome = '你好，我是你的个人助理。很高兴在 DeepChat 见到你！想聊聊手头的研究，或理一理接下来要做的事，随时给我发消息。'
const morningGreetings = [
  '早上好！今天想先从哪件事开始？有需要的话，我们可以一起理一理。',
  '早上好！祝你今天研究顺利。手头有什么想法，随时和我聊聊。',
  '早上好！如果今天有件事想推进，我们可以先聊聊第一步。',
]

function localDate(local: ReturnType<typeof parts>) {
  return new Date(Date.UTC(local.year, local.month - 1, local.day)).toISOString().slice(0, 10)
}

function greetingTimeZone(db: DatabaseSync, memberId: string, deviceTimeZone: string | null) {
  const settings = db.prepare('SELECT time_zone,version FROM personal_memory_settings WHERE member_id=?').get(memberId)
  if (settings && (Number(settings.version) > 1 || settings.time_zone !== defaultTimeZone)) {
    return Timezone.safeParse(settings.time_zone).data ?? deviceTimeZone ?? defaultTimeZone
  }
  return deviceTimeZone ?? defaultTimeZone
}

function nextMorning(at: number, timeZone: string, lastGreetingDate: string) {
  const local = parts(at, timeZone)
  const today = localDate(local)
  if (today > lastGreetingDate && local.hour < morningEndHour) {
    if (local.hour >= morningHour) return new Date(at).toISOString()
    const todayMorning = localInstant({ ...local, hour: morningHour, minute: 0 }, timeZone)
    if (todayMorning !== null) return new Date(todayMorning).toISOString()
  } else {
    const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1))
    const tomorrowMorning = localInstant({
      year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1, day: tomorrow.getUTCDate(),
      hour: morningHour, minute: 0,
    }, timeZone)
    if (tomorrowMorning !== null && tomorrowMorning > at) return new Date(tomorrowMorning).toISOString()
  }
  // Check the local clock again after a zone transition with no unique 09:00.
  return new Date(at + 30 * 60_000).toISOString()
}

function sendGreeting(chat: ChatService, conversationId: string, assistantId: string, text: string) {
  const conversation = chat.conversation(conversationId, false)
  if (conversation.kind !== 'personal') fail('FORBIDDEN')
  chat.joinedAgent(conversation, assistantId)
  return chat.message(conversation.id, {
    senderContactId: assistantId, origin: 'service', text, mentions: [], resources: [], actionIds: [], turnId: null,
  })
}

/** Called during authenticated IM session provisioning, in the same write transaction. */
export function welcomeAssistantOwner(chat: ChatService, conversationId: string, assistantId: string, deviceZone: unknown) {
  const memberId = chat.c.actor.id
  const existing = chat.db.prepare('SELECT device_time_zone FROM assistant_greetings WHERE member_id=?').get(memberId)
  const validatedZone = Timezone.safeParse(deviceZone).data
  const deviceTimeZone = validatedZone ?? (existing?.device_time_zone as string | null | undefined) ?? null
  const at = chat.clock()
  if (existing) {
    if (deviceTimeZone !== existing.device_time_zone) {
      chat.db.prepare('UPDATE assistant_greetings SET device_time_zone=? WHERE member_id=?').run(deviceTimeZone, memberId)
      rescheduleAssistantGreeting(chat.db, memberId, at)
    }
    return
  }

  const timeZone = greetingTimeZone(chat.db, memberId, deviceTimeZone)
  const date = localDate(parts(at, timeZone))
  const message = sendGreeting(chat, conversationId, assistantId, welcome)
  chat.db.prepare('INSERT INTO assistant_greetings VALUES (?,?,?,?,?)').run(memberId, message.id, deviceTimeZone, date, nextMorning(at, timeZone, date))
}

/** Called in the account timezone settings transaction as well as on device timezone changes. */
export function rescheduleAssistantGreeting(db: DatabaseSync, memberId: string, at: number) {
  const row = db.prepare('SELECT device_time_zone,last_greeting_date FROM assistant_greetings WHERE member_id=?').get(memberId)
  if (!row) return
  const timeZone = greetingTimeZone(db, memberId, row.device_time_zone as string | null)
  db.prepare('UPDATE assistant_greetings SET next_daily_at=? WHERE member_id=?')
    .run(nextMorning(at, timeZone, String(row.last_greeting_date)), memberId)
}

export class AssistantGreetingWorker {
  constructor(readonly db: DatabaseSync, readonly config: Config) {}

  async tick(at = Date.now()) {
    const due = this.db.prepare(`SELECT g.* FROM assistant_greetings g
      JOIN auth_accounts a ON a.member_id=g.member_id AND a.disabled=0
      WHERE g.next_daily_at<=? ORDER BY g.next_daily_at,g.member_id LIMIT 1`)
    const now = new Date(at).toISOString()
    if (!due.get(now)) return false

    return transaction(this.db, () => {
      const row = due.get(now)
      if (!row) return false
      const memberId = String(row.member_id)
      const timeZone = greetingTimeZone(this.db, memberId, row.device_time_zone as string | null)
      const local = parts(at, timeZone)
      const today = localDate(local)
      let lastGreetingDate = String(row.last_greeting_date)

      if (today > lastGreetingDate && local.hour >= morningHour && local.hour < morningEndHour) {
        const message = this.db.prepare("SELECT conversation_id,json_extract(document,'$.senderContactId') assistant_id FROM chat_messages WHERE id=?")
          .get(row.welcome_message_id!)!
        const chat = new ChatService(serviceFor(this.db, memberId, this.config).c, this.config)
        const text = morningGreetings[local.day % morningGreetings.length]!
        sendGreeting(chat, String(message.conversation_id), String(message.assistant_id), text)
        lastGreetingDate = today
      }

      this.db.prepare('UPDATE assistant_greetings SET last_greeting_date=?,next_daily_at=? WHERE member_id=?')
        .run(lastGreetingDate, nextMorning(at, timeZone, lastGreetingDate), memberId)
      return true
    })
  }
}
