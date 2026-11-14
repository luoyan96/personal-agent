import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Config } from './config.js'
import { transaction } from './database.js'
import { ChatService } from './chat.js'
import { callHarness, serviceFor, type ModelCall } from './execution-worker.js'
import { compressAgent, compressionSnapshot, regroupAgentNotes, type CompressionSnapshot } from './assistant-memories.js'
import { personalModelKey, personalModelRuntime } from './personal-models.js'
import { waitForWorkerDatabase } from './worker-database.js'

type Job = { id: string; owner_id: string; subject_id: string; attempts: number }
const Groups = z.strictObject({ groups: z.array(z.strictObject({
  topic: z.string().trim().min(1).max(80), ids: z.array(z.string()).min(2).max(20),
})).max(20) })
const compressionSystem = 'Group only notes that describe the same subject. Return strict JSON: {"groups":[{"topic":"short topic","ids":["id"]}]}. Do not merge contradictory content. Use only ids from the input. Omit groups with fewer than two ids.'
const leaseMs = 60_000

/** The attempt number fences every mutation, including model topic updates and final receipts. */
export class MemoryCompressionWorker {
  constructor(readonly db: DatabaseSync, readonly config: Config,
    readonly clock: () => number = Date.now, readonly call: ModelCall = callHarness, readonly modelTimeoutMs = 15_000) {}

  private owns(job: Job) {
    return !!this.db.prepare("SELECT 1 FROM assistant_memory_compression_jobs WHERE id=? AND status='running' AND attempts=? AND lease_until>?").get(job.id, job.attempts, this.clock())
  }
  private service(job: Job) {
    return new ChatService(serviceFor(this.db, job.owner_id, this.config).c, this.config)
  }
  private async proposeGroups(snapshot: CompressionSnapshot, runtime: ReturnType<typeof personalModelRuntime>, apiKey: string | undefined, signal: AbortSignal) {
    const notes = snapshot.filter(note => note.type === 'note').slice(0, 100)
    if (notes.length < 2 || !runtime.enabled) return []
    let deadline: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    try {
      const call = this.call({ provider: runtime.provider, system: compressionSystem,
        prompt: JSON.stringify(notes.map(({ id, topic, summary, type }) => ({ id, topic, summary, type }))),
        model: runtime.model, maxTokens: 800, timeoutMs: this.modelTimeoutMs,
      }, signal, { apiKey: apiKey! })
      const stopped = new Promise<undefined>(resolve => {
        abort = () => resolve(undefined)
        deadline = setTimeout(abort, this.modelTimeoutMs)
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
      const result = await Promise.race([call, stopped])
      if (!result || result.failure || !result.text) return []
      const text = result.text.trim(), start = text.indexOf('{'), end = text.lastIndexOf('}')
      if (start < 0 || end <= start) return []
      const parsed = Groups.safeParse(JSON.parse(text.slice(start, end + 1)))
      const supplied = new Set(notes.map(note => note.id))
      return parsed.success ? parsed.data.groups.filter(group => new Set(group.ids).size === group.ids.length && group.ids.every(id => supplied.has(id))) : []
    } catch { return [] } finally {
      clearTimeout(deadline)
      if (abort) signal.removeEventListener('abort', abort)
    }
  }
  async tick() {
    const job = await waitForWorkerDatabase(() => transaction(this.db, () => {
      const at = new Date(this.clock()).toISOString()
      this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='failed',lease_until=NULL,failure='LEASE_EXPIRED',updated_at=? WHERE status='running' AND COALESCE(lease_until,0)<=? AND attempts>=3").run(at, this.clock())
      this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='queued',lease_until=NULL,failure=NULL,updated_at=? WHERE status='running' AND COALESCE(lease_until,0)<=? AND attempts<3").run(at, this.clock())
      const next = this.db.prepare("SELECT id,owner_id,subject_id,attempts FROM assistant_memory_compression_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").get() as Job | undefined
      if (!next) return
      const claimed = this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND status='queued' AND attempts=?").run(this.clock() + leaseMs, at, next.id, next.attempts)
      return claimed.changes === 1 ? { ...next, attempts: next.attempts + 1 } : undefined
    }))
    if (!job) return false
    const controller = new AbortController()
    let heartbeatFlight: Promise<void> | undefined
    const heartbeat = setInterval(() => {
      if (heartbeatFlight) return
      heartbeatFlight = waitForWorkerDatabase(() => {
        const at = this.clock()
        const renewed = this.db.prepare("UPDATE assistant_memory_compression_jobs SET lease_until=?,updated_at=? WHERE id=? AND status='running' AND attempts=? AND lease_until>?").run(at + leaseMs, new Date(at).toISOString(), job.id, job.attempts, at)
        if (renewed.changes !== 1) controller.abort()
      }).catch(() => controller.abort()).finally(() => { heartbeatFlight = undefined })
    }, 10_000)
    try {
      const prepared = await waitForWorkerDatabase(() => transaction(this.db, () => {
        if (!this.owns(job)) return
        const service = this.service(job), snapshot = compressionSnapshot(service, job.subject_id)
        const runtime = personalModelRuntime(this.db, service.c.actor, this.config)
        return { snapshot, runtime, apiKey: runtime.enabled ? personalModelKey(this.db, service.c.actor, this.config) : undefined }
      }))
      if (!prepared) return true
      const groups = await this.proposeGroups(prepared.snapshot, prepared.runtime, prepared.apiKey, controller.signal)
      await waitForWorkerDatabase(() => transaction(this.db, () => {
        if (!this.owns(job)) return
        const service = this.service(job), latest = compressionSnapshot(service, job.subject_id)
        const unchanged = JSON.stringify(latest) === JSON.stringify(prepared.snapshot) && personalModelRuntime(this.db, service.c.actor, this.config).fingerprint === prepared.runtime.fingerprint
        if (!unchanged) {
          this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='queued',lease_until=NULL,result_json=NULL,failure=NULL,updated_at=? WHERE id=? AND status='running' AND attempts=? AND lease_until>?").run(new Date(this.clock()).toISOString(), job.id, job.attempts, this.clock())
          return
        }
        regroupAgentNotes(service, job.subject_id, prepared.snapshot, groups)
        const result = compressAgent(service, job.subject_id)
        const finished = this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='succeeded',lease_until=NULL,result_json=?,failure=NULL,updated_at=? WHERE id=? AND status='running' AND attempts=? AND lease_until>?").run(JSON.stringify(result), new Date(this.clock()).toISOString(), job.id, job.attempts, this.clock())
        if (finished.changes !== 1) throw Error('COMPRESSION_LEASE_LOST')
      }))
    } catch {
      await waitForWorkerDatabase(() => this.db.prepare("UPDATE assistant_memory_compression_jobs SET status='failed',lease_until=NULL,failure='COMPRESSION_FAILED',updated_at=? WHERE id=? AND status='running' AND attempts=? AND lease_until>?").run(new Date(this.clock()).toISOString(), job.id, job.attempts, this.clock()))
    } finally {
      clearInterval(heartbeat); controller.abort(); await heartbeatFlight
    }
    return true
  }
}
