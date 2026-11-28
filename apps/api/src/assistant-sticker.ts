import { AssistantStickerId, assistantStickerLabels, personalStickerInputPrefix, Text } from '@research-agent-platform/contracts'
import { z } from 'zod'

const stickerReply = z.strictObject({
  kind: z.literal('dafeiyu_sticker'),
  id: z.string().min(1).max(64),
  answer: Text.nullable(),
})

const available = Object.entries(assistantStickerLabels).map(([id, label]) => `${id}=${label}`).join(', ')
export const assistantStickerSystem = `Use text by default. An owner message starting ${personalStickerInputPrefix.trim()} describes a sent sticker; respond to the reaction naturally. Use plain text for serious discussion, research analysis, or work status. Respect the owner's sticker preferences. On request or when a light reaction fits, use at most one 大肥鱼 sticker; no automatic mirroring or repeats. To use one, return only JSON {"kind":"dafeiyu_sticker","id":"listed_id","answer":string|null}. Choices: ${available}. Use null only for a sticker-only request or a purely social reaction. Answer substantive questions fully. Use a single short reply when it suffices. Never claim delivery or show the protocol.`

export function readAssistantStickerReply(text: string) {
  const trimmed = text.trim()
  const body = /^```(?:json)?[^\S\r\n]*\r?\n([\s\S]*?)(?:\r?\n```)?$/i.exec(trimmed)?.[1] ?? trimmed
  if (!body.trimStart().startsWith('{')) return
  const partialKind = /^\s*\{\s*"kind"\s*:\s*"(dafeiyu[a-z_]*)\s*$/.exec(body)?.[1]
  const isSticker = /[{,]\s*"kind"\s*:\s*"dafeiyu_sticker(?=["\s]|$)/.test(body)
  if (!isSticker && !(partialKind && 'dafeiyu_sticker'.startsWith(partialKind))) return
  let value: unknown
  try { value = JSON.parse(body) } catch { return { id: undefined, answer: null } }
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'dafeiyu_sticker') return
  const result = stickerReply.safeParse(value)
  const id = result.success ? AssistantStickerId.safeParse(result.data.id).data : undefined
  const answer = result.success ? result.data.answer : Text.safeParse('answer' in value ? value.answer : null).data
  return { id, answer: answer?.trim() ? answer : null }
}
