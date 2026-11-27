import { AssistantStickerId, assistantStickerLabels, personalStickerInputPrefix, Text } from '@research-agent-platform/contracts'
import { z } from 'zod'

const stickerReply = z.strictObject({
  kind: z.literal('dafeiyu_sticker'),
  id: z.string().min(1).max(64),
  answer: Text.nullable(),
})

const available = Object.entries(assistantStickerLabels).map(([id, label]) => `${id}=${label}`).join(', ')
export const assistantStickerSystem = `Reply in normal text by default. A current owner message starting ${personalStickerInputPrefix.trim()} is a sent sticker described by its caption; respond naturally to that reaction. You may occasionally include one 大肥鱼 sticker when the user asks or it suits a light social moment and the user's tone/preferences. To use one, return only JSON {"kind":"dafeiyu_sticker","id":"listed_id","answer":string|null}. Choices: ${available}. Set answer to null only for a request for just a sticker or a purely social reaction. Answer any actual question in full. Use plain text for serious discussion, research analysis, or work status. Never claim sticker delivery or show the protocol to the user.`

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
