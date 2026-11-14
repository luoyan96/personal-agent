import type { DatabaseSync } from 'node:sqlite'
import { preferenceTopicKey, readPersonalPreferences } from './personal-preferences.js'

export const preferenceTopic = '交流与工作习惯'

export function enqueueFeedback(db: DatabaseSync, member: string, lab: string, scope: string, kind: 'chat'|'planning'|'review', source: string) {
  db.prepare('INSERT INTO assistant_feedback(member_id,lab_id,scope,kind,source_id) VALUES(?,?,?,?,?) ON CONFLICT(kind,source_id) DO NOTHING').run(member, lab, scope, kind, source)
}

export function currentHabit(db: DatabaseSync, member: string, scope = '') {
  if (scope) {
    const row = db.prepare('SELECT content FROM group_dialogue_preferences WHERE member_id=? AND conversation_id=?').get(member, scope)
    return { content: String(row?.content ?? ''), revoked: false, version: 0 }
  }
  const preferences = readPersonalPreferences(db, member)
  if (preferences.assistant.length) {
    const selected = preferences.effective.find(value => preferenceTopicKey(value.topic) === preferenceTopicKey(preferenceTopic))
    return { content: selected?.status === 'confirmed' ? selected.content : '', revoked: selected?.status === 'revoked', version: selected?.version ?? 0 }
  }
  const row = db.prepare("SELECT status,content,version FROM personal_memories WHERE member_id=? AND topic=? ORDER BY (status='confirmed') DESC, updated_at DESC LIMIT 1").get(member, preferenceTopic)
  return { content: row?.status === 'confirmed' ? String(row.content) : '', revoked: row?.status === 'revoked', version: Number(row?.version ?? 0) }
}
