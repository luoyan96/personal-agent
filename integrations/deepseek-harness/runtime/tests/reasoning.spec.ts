import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

describe('pinned official Messages adapter: synthetic reasoning policy and output limits', () => {
  it.each([
    { name: 'provider default stays enabled', off: false, stop: 'end_turn', visible: '合成完整回复', failure: null },
    { name: 'explicit off sends thinking disabled', off: true, stop: 'end_turn', visible: '合成完整回复', failure: null },
    { name: 'reasoning-only truncation is not a reply', off: false, stop: 'max_tokens', visible: '', failure: 'OUTPUT_LIMIT' },
    { name: 'visible but incomplete truncation is not a reply', off: true, stop: 'max_tokens', visible: '合成但尚未完成', failure: 'OUTPUT_LIMIT' },
  ])('$name', async fixture => {
    const home = mkdtempSync(join(tmpdir(), 'rap-reasoning-')); cleanup.push(() => rmSync(home, { recursive: true, force: true }))
    const seen: { thinking: unknown; outputConfig: unknown; maxTokens: number; tools: unknown }[] = []
    const server = createServer((request, response) => {
      let raw = ''; request.on('data', chunk => { raw += String(chunk) })
      request.on('end', () => {
        const body = JSON.parse(raw)
        seen.push({ thinking: body.thinking, outputConfig: body.output_config, maxTokens: body.max_tokens, tools: body.tools })
        const blockType = fixture.visible ? 'text' : 'thinking'
        const events = [
          { type: 'message_start', message: { usage: { input_tokens: 840, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: blockType, [blockType]: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: `${blockType}_delta`, [blockType]: fixture.visible || 'SYNTHETIC_REASONING_ONLY' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: fixture.stop }, usage: { output_tokens: fixture.failure ? body.max_tokens : 100 } },
          { type: 'message_stop' },
        ]
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected loopback address')
    const env: NodeJS.ProcessEnv = { DSH_HOME: home, DEEPSEEK_API_KEY: 'sk-synthetic-reasoning-only', DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}/anthropic` }
    for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) if (process.env[name]) env[name] = process.env[name]
    const child = spawn(process.execPath, [resolve('integrations/deepseek-harness/runtime/dist/cli.js')], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    cleanup.push(() => { if (child.exitCode === null) child.kill() })
    let output = ''; child.stdout.on('data', chunk => { output += String(chunk) }); child.stderr.resume()
    const ended = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    child.stdin.end(JSON.stringify({ system: 'Synthetic fixture only.', prompt: 'No live credentials.', model: 'deepseek-flash', maxTokens: 801, timeoutMs: 3000, ...(fixture.off ? { reasoningEffort: 'off' } : {}) }))
    expect(await ended).toBe(0)
    const result = JSON.parse(output)
    expect(seen).toEqual([{ thinking: { type: fixture.off ? 'disabled' : 'enabled' }, outputConfig: fixture.off ? undefined : { effort: 'high' }, maxTokens: 801, tools: [] }])
    expect(result).toMatchObject({ text: fixture.failure ? '' : fixture.visible, failure: fixture.failure, finishReason: fixture.failure ? 'max-tokens' : 'stop', inputTokens: 840, outputTokens: fixture.failure ? 801 : 100 })
  }, 10000)
})
