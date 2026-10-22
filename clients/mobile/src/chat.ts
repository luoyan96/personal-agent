import type { AgentTurn, ChatMessage, Contact, Conversation, ResponseFor } from '@research-agent-platform/contracts';
import { MobileApi } from './api';

export type SendIntent = { key: string; text: string; error?: string; sending: boolean };
type RetryIntent = { key: string; turn: AgentTurn; error?: string; sending: boolean };
export type ChatState = {
  conversation?: Conversation; agent?: Contact; messages: ChatMessage[]; turns: Record<string, AgentTurn>;
  loading: boolean; refreshing: boolean; error?: string; intent?: SendIntent; retryIntent?: RetryIntent;
};
export const turnLabels: Record<AgentTurn['status'], string> = {
  queued: '已发送，等待助手处理', running: '助手正在回复', waiting_input: '助手需要补充信息', succeeded: '已回复',
  unavailable: '模型暂不可用，请在桌面端检查模型设置', failed: '本次回复失败', interrupted: '本次回复已中断', cancelled: '本次回复已取消',
};
export const canRetry = (turn: AgentTurn) => turn.allowedActions.includes('retry') && !!turn.remainingBudget && turn.failure !== 'BUDGET_EXCEEDED';
const message = (error: unknown) => error instanceof Error ? error.message : '请求未完成，请重试。';

/** One controller per login; all late reads/writes are fenced on disposal. */
export class ChatController {
  private state: ChatState = { messages: [], turns: {}, loading: true, refreshing: false };
  private listeners = new Set<() => void>();
  private generation = 0;
  private opening = false;
  private openKey: string;
  constructor(private api: MobileApi, private uuid: () => string) { this.openKey = uuid(); }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(update: Partial<ChatState>) { this.state = { ...this.state, ...update }; this.listeners.forEach(l => l()); }
  dispose() { this.generation++; this.listeners.clear(); }
  async open() {
    if (this.opening) return;
    this.opening = true; const generation = this.generation;
    this.patch({ loading: true, error: undefined });
    try {
      const result = await this.api.call('personalConversation', { body: {}, key: this.openKey });
      if (generation !== this.generation) return;
      this.patch({ conversation: result.data.conversation, agent: result.data.agent });
      await this.refresh(true);
    } catch (error) { if (generation === this.generation) this.patch({ error: message(error) }); }
    finally { this.opening = false; if (generation === this.generation) this.patch({ loading: false }); }
  }
  async refresh(initial = false, older = false) {
    const conversation = this.state.conversation;
    if (!conversation || this.state.refreshing) return;
    const generation = this.generation;
    this.patch({ refreshing: true });
    try {
      const first = this.state.messages[0]?.sequence ?? conversation.lastSequence + 1;
      let after = older ? Math.max(0, first - 101) : initial ? Math.max(0, conversation.lastSequence - 100) : this.state.messages.at(-1)?.sequence ?? 0;
      const incoming: ChatMessage[] = [];
      let page: ResponseFor<'chatMessages'>;
      do {
        page = await this.api.call('chatMessages', { params: { id: conversation.id }, query: { afterSequence: after, limit: 100 } });
        if (generation !== this.generation) return;
        incoming.push(...page.data.filter(m => !older || m.sequence < first));
        if (older || page.data.length === 0) break;
        after = page.data.at(-1)!.sequence;
      } while (page.nextCursor);
      const merged = new Map(this.state.messages.map(m => [m.id, m]));
      incoming.forEach(m => merged.set(m.id, m));
      const messages = [...merged.values()].sort((a, b) => a.sequence - b.sequence);
      this.patch({ messages });
      const ids = new Set(messages.slice(-20).map(m => m.turnId).filter((id): id is string => !!id));
      for (const turn of Object.values(this.state.turns)) if (['queued', 'running'].includes(turn.status)) ids.add(turn.id);
      const results = await Promise.all([...ids].map(id => this.api.call('chatTurn', { params: { id } })));
      if (generation !== this.generation) return;
      const turns = { ...this.state.turns };
      results.forEach(r => { turns[r.data.id] = r.data; });
      this.patch({ turns, error: undefined });
    } catch (error) { if (generation === this.generation) this.patch({ error: message(error) }); }
    finally { if (generation === this.generation) this.patch({ refreshing: false }); }
  }
  async send(text?: string) {
    if (!this.state.conversation || this.state.intent?.sending || this.state.retryIntent) return;
    const intent = this.state.intent ?? { key: this.uuid(), text: text ?? '', sending: false };
    if (!intent.text.trim() || intent.text.length > 8000) return;
    const generation = this.generation;
    this.patch({ intent: { ...intent, sending: true, error: undefined } });
    try {
      const result = await this.api.call('agentChatMessage', { params: { id: this.state.conversation.id }, body: { text: intent.text }, key: intent.key });
      if (generation !== this.generation) return;
      const sent = result.data.message;
      const messages = [...this.state.messages.filter(m => m.id !== sent.id), sent].sort((a, b) => a.sequence - b.sequence);
      this.patch({ messages, intent: undefined, turns: result.data.turn ? { ...this.state.turns, [result.data.turn.id]: result.data.turn } : this.state.turns });
      await this.refresh();
    } catch (error) { if (generation === this.generation) this.patch({ intent: { ...intent, sending: false, error: message(error) } }); }
  }
  async retryTurn(turn: AgentTurn) {
    if (this.state.intent || this.state.retryIntent?.sending || !canRetry(turn)) return;
    const previous = this.state.retryIntent;
    if (previous && previous.turn.id !== turn.id) return;
    const intent: RetryIntent = previous ?? { key: this.uuid(), turn, sending: false };
    const generation = this.generation;
    this.patch({ retryIntent: { ...intent, sending: true, error: undefined } });
    try {
      const result = await this.api.call('retryChatTurn', { params: { id: intent.turn.id },
        body: { expectedVersion: intent.turn.version, budget: intent.turn.remainingBudget! }, key: intent.key });
      if (generation !== this.generation) return;
      this.patch({ retryIntent: undefined, turns: { ...this.state.turns, [result.data.id]: result.data } });
      await this.refresh();
    } catch (error) { if (generation === this.generation) this.patch({ retryIntent: { ...intent, sending: false, error: message(error) } }); }
  }
}
