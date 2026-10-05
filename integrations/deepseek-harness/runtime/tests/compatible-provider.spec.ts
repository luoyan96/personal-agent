import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { generate } from '../src/index.js'
import { compatibleEndpoints, compatibleUsage } from '../src/compatible-provider.js'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const usage = {prompt_tokens: 100, completion_tokens: 12, total_tokens: 112, prompt_tokens_details: {cached_tokens: 70}}
const data = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`
const textEvent = (content: string) => data({choices: [{index: 0, delta: {content}, finish_reason: null}]})
const finishEvent = (reason = 'stop') => data({choices: [{index: 0, delta: {}, finish_reason: reason}]})
const usageEvent = (value: unknown = usage) => data({choices: [], usage: value})
async function wire(handler: (req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>) => void | Promise<void>, check: (requests: {url: string; body: Record<string,unknown>; headers: IncomingMessage['headers']}[]) => Promise<void>) {
  const requests: {url: string; body: Record<string,unknown>; headers: IncomingMessage['headers']}[] = []
  const server = createServer(async (req,res) => {
    let raw = ''; for await (const part of req) raw += String(part)
    const body = JSON.parse(raw); requests.push({url: String(req.headers['x-test-original-url']), body, headers: req.headers})
    await handler(req,res,body)
  })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test listener')
  const nativeFetch = fetch
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => nativeFetch(`http://127.0.0.1:${address.port}/synthetic-wire`, {...init, headers: {...init?.headers, 'x-test-original-url': String(url)}}))
  vi.stubEnv('MODEL_API_KEY','synthetic-key-not-real')
  try { await check(requests) } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}
const input = (provider: 'qwen' | 'doubao') => ({provider, model: provider === 'qwen' ? 'qwen-plus' : 'ep-synthetic', system: 'Reply naturally. No tools.', prompt: '合成测试文本。', maxTokens: 64, timeoutMs: 2000})

describe('official Harness seam with isolated synthetic Qwen/Doubao wire; no vendor credentials', () => {
  for (const provider of ['qwen','doubao'] as const) it(`${provider}: uses selected official route, text streaming and exact aggregate usage`, async () => {
    await wire((_req,res) => {
      res.writeHead(200, {'content-type':'text/event-stream'})
      // Fragment UTF-8, CRLF and SSE frames as a real network can.
      const payload = Buffer.from(textEvent('你好，') + textEvent('我在。') + finishEvent() + usageEvent() + 'data: [DONE]\r\n\r\n')
      for (let i=0;i<payload.length;i+=7) res.write(payload.subarray(i,i+7))
      res.end()
    }, async requests => {
      const result = await generate(input(provider))
      expect(result).toMatchObject({text:'你好，我在。',failure:null,inputTokens:100,outputTokens:12})
      expect(requests).toHaveLength(1)
      expect(requests[0]!.url).toBe(compatibleEndpoints[provider])
      expect(requests[0]!.body).toMatchObject({model: input(provider).model, stream:true, stream_options:{include_usage:true}, max_tokens:64, messages:[{role:'system',content:'Reply naturally. No tools.'},{role:'user',content:'合成测试文本。'}]})
      expect(requests[0]!.body.tools).toBeUndefined()
      expect(requests[0]!.headers.authorization === 'Bearer synthetic-key-not-real').toBe(true)
      for (const [name,value] of Object.entries(attributionHeaders())) expect(requests[0]!.headers[name.toLowerCase()]).toBe(value)
    })
  })
  it('normalizes aggregate cached prompt without double counting', () => {
    expect(compatibleUsage(usage)).toEqual({inputTokens:30,cacheReadTokens:70,outputTokens:12,totalTokens:112})
    expect(compatibleUsage({prompt_tokens:10,completion_tokens:2})).toEqual({inputTokens:10,cacheReadTokens:0,outputTokens:2,totalTokens:12})
  })
  for (const invalid of [{...usage,total_tokens:999},{...usage,prompt_tokens_details:{cached_tokens:101}},{...usage,completion_tokens:-1},{...usage,prompt_tokens:NaN}]) it('refuses inconsistent or illegal vendor usage', () => {
    expect(() => compatibleUsage(invalid)).toThrow('Invalid provider response')
  })
  it('refuses output with missing usage rather than claiming success', async () => {
    await wire((_req,res) => { res.writeHead(200, {'content-type':'text/event-stream'}); res.end(textEvent('uncounted text') + finishEvent() + 'data: [DONE]\n\n') }, async () => {
      const result = await generate(input('qwen')); expect(result.failure).not.toBeNull(); expect(result.text).toBe('')
    })
  })
  it('redacts provider error bodies and credentials from returned diagnostics', async () => {
    await wire((_req,res) => {res.writeHead(401, {'content-type':'application/json'}); res.end(JSON.stringify({error:{message:'synthetic-key-not-real private-provider-detail'}}))}, async requests => {
      const result = await generate(input('doubao')); expect(result.failure).toBe('AUTH'); expect(result.text).toBe('')
      expect(JSON.stringify(result)).not.toMatch(/synthetic-key|private-provider-detail/); expect(requests).toHaveLength(1)
    })
  })
  it('does not follow credential redirects', async () => {
    await wire((_req,res) => {res.writeHead(302,{location:'http://127.0.0.1:1/private-target'});res.end()}, async requests => {
      const result = await generate(input('qwen')); expect(result.failure).not.toBeNull(); expect(result.text).toBe(''); expect(requests).toHaveLength(1)
    })
  })
  it('honors cancellation during a streaming response', async () => {
    await wire((_req,res) => {res.writeHead(200,{'content-type':'text/event-stream'});res.write(textEvent('not finished'))}, async () => {
      const signal = AbortSignal.timeout(50), result = await generate({...input('doubao'),timeoutMs:500},signal)
      expect(result.failure).not.toBeNull();expect(result.text).toBe('');expect(result.elapsedMs).toBeLessThan(1000)
    })
  })
  it('invalid provider never causes a fallback or network request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch',fetcher)
    const result = await generate({...input('qwen'),provider:'unsupported'} as never)
    expect(result.failure).toBe('PROVIDER_UNAVAILABLE'); expect(fetcher).not.toHaveBeenCalled()
  })
})
