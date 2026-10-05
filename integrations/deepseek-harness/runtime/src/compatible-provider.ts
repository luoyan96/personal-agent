import { attributionHeaders, LlmAdapter, LlmError, type GenerateOptions, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'

export type CompatibleProvider = 'qwen' | 'doubao'
// User-entered URLs are deliberately not a credential destination. These are
// the vendors' official Chat Completions routes, independent of OpenAI service.
export const compatibleEndpoints: Record<CompatibleProvider, string> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
}
type ObjectValue = Record<string, unknown>
const object = (value: unknown): ObjectValue | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : undefined
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const protocolError = () => new LlmError('Invalid provider response', 'PROVIDER_PROTOCOL_ERROR')

// Both APIs report aggregate prompt tokens, including cached tokens. Harness
// expects disjoint input/cache counters; do not add cached input twice.
export function compatibleUsage(value: unknown): TokenUsage {
  const usage = object(value)
  if (!usage || !count(usage.prompt_tokens) || !count(usage.completion_tokens)) throw protocolError()
  const details = object(usage.prompt_tokens_details)
  const cached = details?.cached_tokens ?? 0
  const total = usage.total_tokens ?? usage.prompt_tokens + usage.completion_tokens
  if (!count(cached) || cached > usage.prompt_tokens || !count(total) || total !== usage.prompt_tokens + usage.completion_tokens) throw protocolError()
  return { inputTokens: usage.prompt_tokens - cached, cacheReadTokens: cached, outputTokens: usage.completion_tokens, totalTokens: total }
}

// Bounded text-only adapter registered through the installed public Harness
// seam. The fetch injection is for isolated wire tests, never user settings.
export class CompatibleChatAdapter extends LlmAdapter {
  constructor(readonly provider: CompatibleProvider, private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) { super() }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!this.apiKey || !/^[\x21-\x7e]{5,512}$/.test(this.apiKey)) throw new LlmError('Model credential is missing', 'MISSING_CREDENTIAL')
    if (options.provider !== this.provider || options.tools?.length || options.reasoningEffort || options.toolHistory) throw new LlmError('Unsupported model request', 'UNSUPPORTED_REQUEST')
    const messages: {role: string; content: string}[] = []
    if (options.system) messages.push({ role: 'system', content: options.system })
    for (const message of options.messages) {
      if (!['system','user','assistant'].includes(message.role) || message.content.some(block => block.type !== 'text')) throw new LlmError('Only text messages are supported', 'UNSUPPORTED_REQUEST')
      messages.push({role: message.role, content: message.content.map(block => block.type === 'text' ? block.text : '').join('')})
    }
    const response = await this.fetcher(compatibleEndpoints[this.provider], {
      method: 'POST', redirect: 'error', signal: options.signal,
      headers: {'content-type': 'application/json', authorization: `Bearer ${this.apiKey}`, ...attributionHeaders()},
      body: JSON.stringify({model: options.model, messages, stream: true, stream_options: {include_usage: true}, max_tokens: options.maxTokens,
        ...(options.temperature === undefined ? {} : {temperature: options.temperature}), ...(options.stop ? {stop: options.stop} : {})}),
    })
    if (!response.ok) {
      await response.body?.cancel()
      const code = response.status === 401 || response.status === 403 ? 'AUTH' : response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_HTTP_ERROR'
      // Never relay the response body, which can include credentials or input.
      throw new LlmError('Model provider refused the request', code, {status: response.status})
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) { await response.body?.cancel(); throw protocolError() }
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let buffer = '', text = '', started = false, bytes = 0, terminal: 'stop' | 'max-tokens' | null = null, usage: TokenUsage | null = null, done = false
    const processEvent = (event: string): StreamChunk[] => {
      const payload = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!payload) return []
      if (payload === '[DONE]') { done = true; return [] }
      if (done) throw protocolError()
      const record = object(JSON.parse(payload)); if (!record || record.error) throw protocolError()
      if (record.usage !== undefined && record.usage !== null) usage = compatibleUsage(record.usage)
      if (!Array.isArray(record.choices) || record.choices.length > 1) throw protocolError()
      const choice = object(record.choices[0]); if (!choice) return []
      if (choice.index !== undefined && choice.index !== 0) throw protocolError()
      const delta = object(choice.delta), result: StreamChunk[] = []
      if (delta?.tool_calls || delta?.function_call) throw protocolError()
      if (delta?.content !== undefined && delta.content !== null) {
        if (typeof delta.content !== 'string' || terminal) throw protocolError()
        if (delta.content) {
          text += delta.content; if (text.length > 100000) throw new LlmError('Model output limit exceeded', 'OUTPUT_LIMIT')
          if (!started) { result.push({type: 'block-start', index: 0, blockType: 'text'}); started = true }
          result.push({type: 'text-delta', index: 0, text: delta.content})
        }
      }
      if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
        if (terminal || !['stop','length'].includes(String(choice.finish_reason))) throw protocolError()
        terminal = choice.finish_reason === 'length' ? 'max-tokens' : 'stop'
      }
      return result
    }
    try {
      while (!done) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength; if (bytes > 2000000) throw new LlmError('Model output limit exceeded', 'OUTPUT_LIMIT')
        buffer += decoder.decode(part.value, {stream: true})
        let match: RegExpExecArray | null
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length)
          for (const chunk of processEvent(event)) yield chunk
        }
        if (buffer.length > 250000) throw new LlmError('Model event limit exceeded', 'OUTPUT_LIMIT')
      }
      buffer += decoder.decode()
      if (buffer.trim()) for (const chunk of processEvent(buffer)) yield chunk
      if (!terminal || !usage || !started) throw protocolError()
      yield {type: 'block-end', index: 0, block: {type: 'text', text}}
      yield {type: 'usage', usage}
      yield {type: 'finish', reason: {kind: terminal}}
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  }
}
