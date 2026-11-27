import { z } from 'zod'

export const personalStickerInputPrefix = '[大肥鱼娘贴纸] '

export const assistantStickerLabels = {
  wave: '打招呼',
  celebrate: '好耶',
  goodnight: '晚安',
  think: '让我想想',
  comfort: '摸摸头',
  heart: '给你比心',
} as const

export const AssistantStickerId = z.enum(Object.keys(assistantStickerLabels) as Array<keyof typeof assistantStickerLabels>)
export type AssistantStickerId = z.infer<typeof AssistantStickerId>

// Carried in the SDK Custom extension; older clients can still read the same research pointer and text.
export const AssistantStickerExtension = z.strictObject({
  type: z.literal('dafeiyu_sticker'),
  version: z.literal(1),
  id: AssistantStickerId,
})

export function assistantStickerFallback(id: AssistantStickerId) {
  return `[大肥鱼表情] ${assistantStickerLabels[id]}`
}
