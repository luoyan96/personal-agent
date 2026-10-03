import type { MemberModel } from '@research-agent-platform/contracts';
import type { ChatSource } from './chat-view';
/** Until the shared chat contract lands, only actual authorized members are projected.
 * No guessed agent IDs, online status, messages or writable commands. */
export function pendingChatSource(members: MemberModel[]): ChatSource {
  return {async read(signal) {
    signal.throwIfAborted();
    return {
      contacts:members.map(member=>({id:member.id,name:member.displayName,identity:'真人',owner:'本实验室成员',availability:'在线状态未提供',icon:'user' as const})),
      conversations:[],notice:'聊天接口待接通 · 未读取到个人智能体或任务群记录',
    };
  }};
}
