import { parseXml, XmlElement, XmlDocumentType } from '@rgrove/parse-xml'
import { setTimeout as delay } from 'node:timers/promises'
import { LiteratureRecommendationItem } from '@research-agent-platform/contracts'

const endpoint = 'https://export.arxiv.org/api/query'
const articleId = /^https?:\/\/arxiv\.org\/abs\/((?:\d{4}\.\d{4,5}|[a-z][a-z.-]*\/\d{7}))(?:v\d+)?$/i
const maxBodyBytes = 512 * 1024
const stopWords = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

export function arxivRecommendationRequest(text: string): { recent: boolean } | null {
  const request = text.replace(/```[\s\S]*?```|^\s*>[^\n]*|`[^`\n]*`|“[^“”\n]*”|「[^「」\n]*」|『[^『』\n]*』|"[^"\n]*"/gm, ' ').trim()
  if (/(?:^|[，,。;；\n])\s*(?:(?:但|不过)\s*)?(?:先)?(?:不要|别|不用|取消|只是举例|只是引用|do not|don't|never)/i.test(request)) return null
  const cn = /^(?:(?:请(?:你)?|你能|你可不可以|能不能|能|可不可以|可否|可以|麻烦(?:你)?|帮我|我想|想请你|想)\s*){0,4}(?:(?:按(?:照)?|基于|围绕|结合)[^，,。\n]{1,45}\s*)?(?:(?:帮我|给我|请)\s*)?(?:推(?:荐)?|给(?:我|咱们)|找(?:找|一下)?|搜(?:索|一下)?|检索|查找|有没有|有什么|列(?:出|一下)?)[^，。！？?!\n]{0,75}(?:论文|文献|预印本|arxiv)(?!库|管理|工具|软(?:件|体)|格式|写作|修改|润色|模[板版]|怎么)/i
  const en = /^(?:(?:please|(?:could|can|would) you|help me|i(?:'d like| want)(?: you to| to)?)\s+){0,3}(?:recommend|suggest|find|look for|list|show me|what are)\b[^.!?\n]{0,110}\b(?:papers|preprints|arxiv)\b(?!\s+(?:edit|writ|format|manag|template|citation))/i
  for (const part of request.split(/[，,。；;！!？?\n]/)) {
    const clause = part.trim()
    if (!cn.test(clause) && !en.test(clause)) continue
    if (/.{0,70}(?:论文|文献)\s*(?:的?(?:修改|润色|写作|模板|模版|检索|管理|引用|翻译|评审|格式)|里|中)/.test(clause)) continue
    return { recent: /最新|最近|近期|\b(?:recent|latest|newest)\b/i.test(clause) }
  }
  return null
}

export function arxivSearchTerms(label: string) {
  const words = label.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase().match(/[a-z0-9]+/g) ?? []
  return [...new Set(words.filter(word => !stopWords.has(word) && !/^\d+$/.test(word) && word.length <= 40))].slice(0, 6)
}

function textOf(element: XmlElement, name: string) {
  return element.children.find((node): node is XmlElement => node instanceof XmlElement && node.name === name)
    ?.text.replace(/\s+/gu, ' ').trim()
}

export function parseArxivRecommendations(body: string): LiteratureRecommendationItem[] {
  const document = parseXml(body)
  const feed = document.root
  if (document.children.some(node => node instanceof XmlDocumentType) || feed?.name !== 'feed' || feed.attributes.xmlns !== 'http://www.w3.org/2005/Atom')
    throw new Error('Unexpected arXiv response')
  const entries = feed.children.filter((node): node is XmlElement => node instanceof XmlElement && node.name === 'entry')
  const records = new Map<string, LiteratureRecommendationItem>()
  for (const entry of entries) {
    const id = articleId.exec(textOf(entry, 'id') ?? '')?.[1]?.toLowerCase()
    if (!id) continue
    const published = Date.parse(textOf(entry, 'published') ?? '')
    const item = LiteratureRecommendationItem.safeParse({
      id,
      title: textOf(entry, 'title'),
      authors: entry.children.filter((node): node is XmlElement => node instanceof XmlElement && node.name === 'author')
        .map(author => textOf(author, 'name')).filter(Boolean).slice(0, 100),
      summary: textOf(entry, 'summary') || undefined,
      published: Number.isFinite(published) ? new Date(published).toISOString() : undefined,
    })
    if (item.success && !records.has(id)) records.set(id, item.data)
    if (records.size === 5) break
  }
  const total = textOf(feed, 'opensearch:totalResults')
  if (!records.size && (entries.length || total !== '0')) throw new Error('arXiv returned no valid records')
  return [...records.values()]
}

export type ArxivSearch = (directions: string[], options: { recent: boolean; signal: AbortSignal }) => Promise<LiteratureRecommendationItem[]>

// Production has a single chat worker. Serialize calls in the worker and
// space starts even when the previous call failed.
let currentRequest = Promise.resolve()
let nextRequestAt = 0

export const searchArxiv: ArxivSearch = (directions, { recent, signal }) => {
  const clauses = directions.map(arxivSearchTerms).filter(words => words.length).map(words =>
    '(' + words.map(word => '(ti:' + word + ' OR abs:' + word + ')').join(' AND ') + ')')
  if (!clauses.length) return Promise.reject(new Error('No arXiv search terms'))
  const url = new URL(endpoint)
  url.searchParams.set('search_query', [...new Set(clauses)].join(' OR '))
  url.searchParams.set('sortBy', recent ? 'submittedDate' : 'relevance')
  url.searchParams.set('sortOrder', 'descending')
  url.searchParams.set('max_results', '10')
  const request = currentRequest.then(async () => {
    signal.throwIfAborted()
    if (nextRequestAt > Date.now()) await delay(nextRequestAt - Date.now(), undefined, { signal })
    nextRequestAt = Date.now() + 3000
    const response = await fetch(url, {
      headers: { Accept: 'application/atom+xml', 'User-Agent': 'DeepChat paper recommendations (https://github.com/luoyan96/personal-agent)' },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error('arXiv unavailable')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0, body = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > maxBodyBytes) throw new Error('Oversized arXiv response')
        body += decoder.decode(value, { stream: true })
      }
      return parseArxivRecommendations(body + decoder.decode())
    } finally { await reader.cancel() }
  })
  currentRequest = request.then(() => undefined, () => undefined)
  return request
}
