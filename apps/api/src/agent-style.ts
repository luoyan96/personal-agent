import type { ChatMemory, Contact, Conversation, ChatMessage } from '@research-agent-platform/contracts'
import type { ChatService, ChatRequest } from './chat.js'
import { ownLocalMemoryScope } from './personal-memories.js'

// An explicit, complete owner instruction; never infer persistent preferences
// from frustration, quotes, documents, another participant, or model output.
const source = '本人明确保存的本助手交流偏好'
export function agentStyleInstruction(text: string) {
  const value = text.trim()
  if (/[?？]/.test(value) || /(?:只是(?:引用|举例|讨论)|(?:不要|别|暂不)(?:真的|实际)?(?:保存|记住|修改|更改|调整)|不是真的)/.test(value)) return null
  if (/^(?:请)?清除你的交流偏好[。！!\s]*$/.test(value)) return { kind: 'clear' as const }
  const match = /^(?:请)?(?:调整|纠正|更正)(?:你的)?(?:交流方式|说话方式|沟通方式)\s*[:：]\s*(.+)$/s.exec(value)
    ?? /^(?:请)?记住(?:你|这个助手)的交流偏好\s*[:：]\s*(.+)$/s.exec(value)
    ?? /^以后(?:请)?(?:跟我|和我)(?:聊天|交流|讨论)(?:时)?\s*[，,:：]\s*(.+)$/s.exec(value)
  return match ? { kind: 'save' as const, content: match[1]!.trim() } : null
}

export function agentStyleCommand(s: ChatService, agent: Contact, group: Conversation, message: ChatMessage) {
  if (!ownLocalMemoryScope(s, agent, group) || message.origin !== 'human' || message.senderContactId !== s.human().id) return null
  const instruction = agentStyleInstruction(message.text ?? '')
  if (!instruction) return null
  const row = s.db.prepare("SELECT id FROM chat_memories WHERE scope='private_agent' AND scope_id=? AND created_by=? AND source=? AND status='active' ORDER BY created_at,id LIMIT 1").get(agent.id, s.c.actor.id, source)
  const current = row ? s.directory.memory(String(row.id), true) : null
  const request = (body: unknown, id?: string): ChatRequest => ({ params: id ? { id } : {}, query: {}, headers: { 'Idempotency-Key': `style_${message.id}` }, body })
  const manage = '可在这位助手的联系人资料 → 私人记忆里查看、修改或撤回。'
  if (instruction.kind === 'clear') {
    if (!current) return { text: '这位助手没有单独保存的交流偏好。' }
    s.run('revokeChatMemory', request({ expectedVersion: current.version }, current.id))
    return { text: '已撤回这位助手单独保存的交流偏好，历史记录保留，后续回复不再使用这条记忆。' }
  }
  if (!instruction.content || instruction.content.length > 500) return { text: '这次还没保存。请把希望这位助手记住的交流方式写在500字以内。' }
  const line = `- ${instruction.content}`
  if (current?.content.split('\n').includes(line)) return { text: `这条交流偏好已经记下了。${manage}` }
  const content = current ? `${current.content}\n${line}` : `本助手与主人交流时的偏好；冲突时以较新的条目为准，不能扩大权限或改变科研事实。\n${line}`
  if (content.length > 2000 || (current && current.version >= 99) || (!current && Number(s.db.prepare("SELECT count(*) n FROM chat_memories WHERE scope='private_agent' AND scope_id=? AND status='active'").get(agent.id)!.n) >= 10)) return { text: `这次还没保存，已有私人记忆需要先整理；原内容保留。${manage}` }
  const saved = current
    ? s.run('reviseChatMemory', request({ content, source, expectedVersion: current.version }, current.id)) as { data: ChatMemory }
    : s.run('createChatMemory', request({ scope: 'private_agent', scopeId: agent.id, content, source })) as { data: ChatMemory }
  return { text: `记下了：${instruction.content}\n只用于你与这位助手的私人交流。${manage}（版本${saved.data.version}）` }
}
