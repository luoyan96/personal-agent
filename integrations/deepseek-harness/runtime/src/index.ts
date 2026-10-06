import { Context } from '@deepseek-ai/cordis'
import Llm from '@deepseek-ai/dsh-llm'
import * as DeepSeek from '@deepseek-ai/dsh-llm-deepseek-api-key'
import { normalizeUsage } from './usage.js'
import { CompatibleChatAdapter } from './compatible-provider.js'

export const harnessVersion = '0.2.0-rc.1'
export interface ModelInput { system: string; prompt: string; model: string; maxTokens: number; timeoutMs: number; provider?: 'deepseek' | 'qwen' | 'doubao'; reasoningEffort?: 'off' }
export interface ModelResult { text: string; failure: string | null; inputTokens: number | null; outputTokens: number | null; elapsedMs: number; finishReason?:string }

// A bounded official Harness composition. No shell, filesystem, discovery,
// session-upload, credentials-store or local ArtifactStore plugins are mounted.
export async function generate(input: ModelInput, signal?: AbortSignal, onTextDelta?: (text:string)=>void): Promise<ModelResult> {
  const ctx = new Context(), started = Date.now()
  const result: ModelResult = { text: '', failure: null, inputTokens: null, outputTokens: null, elapsedMs: 0 }
  try {
    await ctx.plugin(Llm)
    const provider = input.provider ?? 'deepseek'
    if(input.reasoningEffort!==undefined&&(input.reasoningEffort!=='off'||provider!=='deepseek'))throw Object.assign(new Error('Unsupported reasoning policy'),{code:'UNSUPPORTED_REQUEST'})
    if (provider === 'deepseek') await ctx.plugin(DeepSeek, { apiKeyEnv: 'DEEPSEEK_API_KEY', ...(input.reasoningEffort==='off'?{reasoningEffort:'off' as const}:{}), ...(process.env.DEEPSEEK_BASE_URL ? { baseURL: process.env.DEEPSEEK_BASE_URL } : {}) })
    else if (provider === 'qwen' || provider === 'doubao') ctx.llm.registerAdapter([provider], new CompatibleChatAdapter(provider, process.env.MODEL_API_KEY ?? ''))
    else throw Object.assign(new Error('Unsupported provider'), {code: 'PROVIDER_UNAVAILABLE'})
    for await (const chunk of ctx.llm.stream({ provider: provider === 'deepseek' ? 'deepseek-official' : provider, model: input.model, system: input.system, messages: [{role:'user',content:[{type:'text',text:input.prompt}]}], tools: [], maxTokens: input.maxTokens, signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(input.timeoutMs)]) : AbortSignal.timeout(input.timeoutMs) })) {
      if (chunk.type === 'text-delta') {result.text += chunk.text;if(result.text.length<=100000)onTextDelta?.(chunk.text)}
      if (chunk.type === 'usage') { Object.assign(result,normalizeUsage(chunk.usage)); if(result.inputTokens===null||result.outputTokens===null)result.failure='USAGE_UNCERTAIN' }
      if(chunk.type==='finish'){result.finishReason=chunk.reason.kind;if(chunk.reason.kind==='max-tokens')result.failure='OUTPUT_LIMIT'}
      if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) result.failure = chunk.reason.failure.code
      if (result.text.length > 100000) { result.failure = 'OUTPUT_LIMIT'; break }
    }
  } catch (error) {
    const code = (error as { code?: unknown }).code
    result.failure = typeof code === 'string' && /^[A-Z_]{1,80}$/.test(code) ? code : 'HARNESS_ERROR'
  } finally { await ctx.fiber.dispose(); result.elapsedMs = Date.now()-started }
  if(!result.failure&&(result.inputTokens===null||result.outputTokens===null))result.failure='USAGE_UNCERTAIN'
  if (result.failure) result.text = ''
  return result
}
