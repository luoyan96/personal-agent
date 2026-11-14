import type { DatabaseSync } from 'node:sqlite'
import { hash } from './auth.js'

export type PersonalPreference = {
  id: string
  topic: string
  content: string
  scope: 'general' | 'topic'
  status: 'candidate' | 'confirmed' | 'revoked'
  origin: 'explicit' | 'feedback' | 'inferred'
  version: number
  updatedAt: string
  store: 'personal' | 'assistant_personal'
}
const aliases: Record<string, string> = { '回答方式': '回复方式', '回复风格': '回复方式', '回答风格': '回复方式', '名字': '称呼' }
export function preferenceTopicKey(topic: string) {
  const normalized = topic.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  return aliases[normalized] ?? normalized
}

/** Read both authorities without copying records or changing either history. */
export function readPersonalPreferences(db: DatabaseSync, owner: string) {
  const legacy = db.prepare('SELECT * FROM personal_memories WHERE member_id=? ORDER BY id').all(owner).map(row => ({
    id: String(row.id), topic: String(row.topic), content: String(row.content), scope: row.scope,
    status: row.status, origin: row.origin, version: Number(row.version), updatedAt: String(row.updated_at), store: 'personal',
  } as PersonalPreference))
  const assistant = db.prepare("SELECT * FROM assistant_memories WHERE owner_id=? AND scope='personal' AND type='preference' ORDER BY id").all(owner).map(row => {
    const payload = JSON.parse(String(row.payload_json)) as { value: string; appliesTo?: 'general' | 'topic' }
    return { id: String(row.id), topic: String(row.topic), content: payload.value, scope: payload.appliesTo ?? 'general',
      status: row.status, origin: row.origin, version: Number(row.version), updatedAt: String(row.updated_at), store: 'assistant_personal',
    } as PersonalPreference
  })
  // A candidate is a suggestion. Confirmed updates and revocations compete by
  // their actual write time; equal timestamps retain the legacy authority.
  const effective = new Map<string, PersonalPreference>()
  for (const value of [...assistant, ...legacy]) {
    if (value.status === 'candidate') continue
    const topic = preferenceTopicKey(value.topic), previous = effective.get(topic)
    if (!previous || value.updatedAt >= previous.updatedAt) effective.set(topic, value)
  }
  return { legacy, assistant, effective: [...effective.values()] }
}

export function personalPreferencesFingerprint(db: DatabaseSync, owner: string, settingsVersion: number) {
  const { legacy, assistant } = readPersonalPreferences(db, owner)
  const versions = (records: PersonalPreference[]) => records.map(({ id, version, status }) => ({ id, version, status }))
  // Preserve pre-0.49 fingerprints when this owner has no new-domain preference.
  return hash(JSON.stringify({ settings: settingsVersion, all: versions(legacy), ...(assistant.length ? { assistant: versions(assistant) } : {}) }))
}
