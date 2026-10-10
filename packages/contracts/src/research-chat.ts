import { z } from 'zod'
import { ResearchCitation } from './research-library.js'
import { Title } from './models.js'

// This receipt records context supplied to a model, not a claim that its answer
// or every assertion in it has been independently verified.
export const ResearchReadReceipt = z.strictObject({
  status: z.enum(['excerpts', 'no_match', 'budget_limited']),
  retrieval: z.enum(['keyword', 'overview']),
  collectionCount: z.number().int().min(1).max(20),
  characterCount: z.number().int().nonnegative().max(10000),
  sources: z.array(z.strictObject({
    label: z.string().regex(/^R(?:[1-9]|1[0-9]|20)$/), filename: Title, citation: ResearchCitation,
  })).max(20),
  omittedSources: z.number().int().nonnegative().max(20),
})
export type ResearchReadReceipt = z.infer<typeof ResearchReadReceipt>
