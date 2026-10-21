import { createHash } from 'node:crypto'
import { z } from 'zod'
import { fail, ApiError } from '../errors.js'

export type FeishuTransport = typeof fetch
const root = 'https://open.feishu.cn/open-apis'
export const feishuScopes = 'contact:user.base:readonly docx:document:readonly wiki:wiki:readonly'
export const feishuLibraryScope = 'bitable:app:readonly'
// URLs select opaque IDs only. Never fetch a user-supplied URL or follow redirects.
export function feishuLink(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    fail('FEISHU_LINK_INVALID')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !/(^|\.)feishu\.cn$/.test(url.hostname)
  )
    fail('FEISHU_LINK_INVALID')
  const match = /^\/(docx|wiki)\/([A-Za-z0-9]{8,100})\/?$/.exec(url.pathname)
  if (!match) fail('FEISHU_LINK_INVALID')
  return { kind: match[1] as 'docx' | 'wiki', id: match[2]!, url: `${url.origin}/${match[1]}/${match[2]}` }
}
const identity = z.object({
  open_id: z.string().min(1).max(200),
  tenant_key: z.string().min(1).max(200),
  name: z.string().min(1).max(200)
})
const meta = z.object({
  document: z.object({
    document_id: z.string().min(1),
    revision_id: z.number().int().nonnegative(),
    title: z.string().max(500)
  })
})
export class FeishuClient {
  constructor(private readonly transport: FeishuTransport = fetch) {}
  protected async json(path: string, token?: string, body?: unknown, signal?: AbortSignal) {
    const deadline = AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])])
    try {
      const response = await this.transport(root + path, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: deadline,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
      // Feishu also returns structured authorization errors with HTTP 400.
      if (!response.ok && response.status !== 400) {
        await response.body?.cancel()
        if (response.status === 401) fail('FEISHU_REAUTHORIZE')
        if (response.status === 403 || response.status === 404) fail('FEISHU_ACCESS_DENIED')
        fail('FEISHU_UNAVAILABLE')
      }
      if (!response.body) fail('FEISHU_UNAVAILABLE')
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          deadline.throwIfAborted()
          const part = await reader.read()
          if (part.done) break
          size += part.value.byteLength
          if (size > 1024 * 1024) fail('FILE_EXTRACTION_LIMIT')
          chunks.push(part.value)
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      if (result.error || (result.code !== undefined && result.code !== 0)) {
        if ([99991661, 99991663, 99991664, 99991668, 99991679].includes(Number(result.code))) fail('FEISHU_REAUTHORIZE')
        // Never expose provider error messages: they can contain tokens, document text or identifiers.
        fail(token ? 'FEISHU_ACCESS_DENIED' : 'FEISHU_REAUTHORIZE')
      }
      if (!response.ok) fail('FEISHU_UNAVAILABLE')
      return result
    } catch (error) {
      if (error instanceof ApiError) throw error
      fail('FEISHU_UNAVAILABLE')
    }
  }
  async exchange(
    appId: string,
    secret: string,
    code: string,
    redirectUri: string,
    verifier: string,
    signal?: AbortSignal
  ) {
    const raw = await this.json(
      '/authen/v2/oauth/token',
      undefined,
      {
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: secret,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier
      },
      signal
    )
    const parsed = z
      .object({
        access_token: z.string().min(1).max(32768),
        token_type: z.string().refine((s) => s.toLowerCase() === 'bearer'),
        expires_in: z.number().int().positive().max(86400),
        scope: z.string().optional()
      })
      .safeParse(raw)
    if (!parsed.success) fail('FEISHU_REAUTHORIZE')
    const person = identity.safeParse(
      (await this.json('/authen/v1/user_info', parsed.data.access_token, undefined, signal)).data
    )
    if (!person.success) fail('FEISHU_REAUTHORIZE')
    return { ...parsed.data, ...person.data }
  }
  async document(url: string, token: string, signal?: AbortSignal) {
    const link = feishuLink(url)
    let id = link.id
    if (link.kind === 'wiki') {
      const node = z
        .object({
          node: z.object({ obj_type: z.string(), obj_token: z.string().regex(/^[A-Za-z0-9]{8,100}$/) })
        })
        .safeParse((await this.json(`/wiki/v2/spaces/get_node?token=${id}`, token, undefined, signal)).data)
      if (!node.success) fail('FEISHU_UNAVAILABLE')
      if (node.data.node.obj_type !== 'docx') fail('FEISHU_LINK_INVALID')
      id = node.data.node.obj_token
    }
    const path = `/docx/v1/documents/${id}`
    const readMeta = async () => {
      const value = meta.safeParse((await this.json(path, token, undefined, signal)).data)
      if (!value.success || value.data.document.document_id !== id) fail('FEISHU_UNAVAILABLE')
      return value.data.document
    }
    const before = await readMeta()
    const text = z
      .object({ content: z.string().min(1).max(100000) })
      .safeParse((await this.json(path + '/raw_content', token, undefined, signal)).data)
    if (!text.success) fail('FILE_EXTRACTION_LIMIT')
    const after = await readMeta()
    if (before.revision_id !== after.revision_id) fail('VERSION_CONFLICT')
    return {
      title: after.title || '未命名飞书文档',
      sourceUrl: link.url,
      documentId: id,
      revision: after.revision_id,
      content: text.data.content,
      sha256: createHash('sha256').update(text.data.content).digest('hex')
    }
  }
}
