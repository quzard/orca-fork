import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { scanAiVaultSessions } from '../../src/main/ai-vault/session-scanner'
import { resetSessionParseCacheForTests } from '../../src/main/ai-vault/session-parse-cache-store'
import { isolatedScanRoots } from '../../src/main/ai-vault/session-scanner-test-fixtures'
import type { AiVaultListResult } from '../../src/shared/ai-vault-types'
import type { AiVaultScanOptions } from '../../src/main/ai-vault/session-scanner-types'

const FOREGROUND_WAIT_MS = 150
const SCAN_LIMIT = 1000

type Sample = {
  label: string
  ms: number
  sessions: number
  heapMiB: number
  rssMiB: number
}

type Corpus = {
  label: string
  sessions: number
  records: number
  toolBytes: number
}

const samples: Sample[] = []

function miB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

function memory(): { heapMiB: number; rssMiB: number } {
  const usage = process.memoryUsage()
  return { heapMiB: miB(usage.heapUsed), rssMiB: miB(usage.rss) }
}

async function scanHost(root: string): Promise<AiVaultListResult> {
  const options: AiVaultScanOptions = {
    ...isolatedScanRoots(root),
    limit: SCAN_LIMIT,
    includeAntigravityIdeSessions: false
  }
  return scanAiVaultSessions(options)
}

async function writeCorpus(root: string, corpus: Corpus, hostIndex: number): Promise<void> {
  const projectsDir = isolatedScanRoots(root).claudeProjectsDir
  const tool = corpus.toolBytes > 0 ? 'T'.repeat(corpus.toolBytes) : ''
  const writes: Promise<void>[] = []
  for (let index = 0; index < corpus.sessions; index++) {
    const sessionId = `h${hostIndex}-s${index}`
    const cwd = `/data/host-${hostIndex}/repo-${index % 40}/app`
    const dir = join(projectsDir, `bucket-${index % 40}`)
    const lines: string[] = []
    for (let record = 0; record < corpus.records; record++) {
      lines.push(
        JSON.stringify({
          type: record === 0 ? 'user' : 'assistant',
          sessionId,
          timestamp: new Date(Date.UTC(2026, 0, 1, hostIndex, 0, index % 60, record)).toISOString(),
          cwd,
          message: {
            role: record === 0 ? 'user' : 'assistant',
            content:
              record === 1 && tool
                ? [{ type: 'tool_result', content: tool }]
                : `host ${hostIndex} session ${index} turn ${record}`
          }
        })
      )
    }
    writes.push(
      mkdir(dir, { recursive: true }).then(() =>
        writeFile(join(dir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`)
      )
    )
    if (writes.length >= 64) {
      await Promise.all(writes)
      writes.length = 0
    }
  }
  await Promise.all(writes)
}

async function timed(
  label: string,
  run: () => Promise<AiVaultListResult>
): Promise<AiVaultListResult> {
  const started = performance.now()
  const result = await run()
  const mem = memory()
  samples.push({
    label,
    ms: Math.round(performance.now() - started),
    sessions: result.sessions.length,
    heapMiB: mem.heapMiB,
    rssMiB: mem.rssMiB
  })
  return result
}

async function previousForkFirst(
  scan: () => Promise<AiVaultListResult>
): Promise<{ firstMs: number; fullMs: number; firstSessions: number; fullSessions: number }> {
  let result: AiVaultListResult | undefined
  const started = performance.now()
  const promise = scan().then((value) => {
    result = value
    return value
  })
  await Promise.race([
    promise,
    new Promise<void>((resolve) => {
      setTimeout(resolve, FOREGROUND_WAIT_MS)
    })
  ])
  const firstMs = Math.round(performance.now() - started)
  const firstSessions = result?.sessions.length ?? 0
  const finished = result ?? (await promise)
  return {
    firstMs,
    fullMs: Math.round(performance.now() - started),
    firstSessions,
    fullSessions: finished.sessions.length
  }
}

async function measureOne(parent: string, corpus: Corpus): Promise<void> {
  const root = join(parent, corpus.label)
  const generated = performance.now()
  await writeCorpus(root, corpus, 0)
  samples.push({
    label: `${corpus.label}-generate`,
    ms: Math.round(performance.now() - generated),
    sessions: corpus.sessions,
    heapMiB: memory().heapMiB,
    rssMiB: memory().rssMiB
  })
  resetSessionParseCacheForTests()
  const cold = await timed(`${corpus.label}-upstream-cold`, () => scanHost(root))
  expect(cold.sessions.length).toBeGreaterThan(0)
  await timed(`${corpus.label}-upstream-warm`, () => scanHost(root))
  await timed(`${corpus.label}-upstream-repeat`, () => scanHost(root))
  resetSessionParseCacheForTests()
  const stale = await previousForkFirst(() => scanHost(root))
  samples.push({
    label: `${corpus.label}-previous-fork-first`,
    ms: stale.firstMs,
    sessions: stale.firstSessions,
    heapMiB: memory().heapMiB,
    rssMiB: memory().rssMiB
  })
  samples.push({
    label: `${corpus.label}-previous-fork-full`,
    ms: stale.fullMs,
    sessions: stale.fullSessions,
    heapMiB: memory().heapMiB,
    rssMiB: memory().rssMiB
  })
  await rm(root, { recursive: true, force: true })
}

describe('ai vault scan measurement', () => {
  it('scales a multi-host JSONL corpus and records first list, full scan, and repeat', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'orca-ai-vault-measure-'))
    try {
      await measureOne(parent, {
        label: 'medium',
        sessions: 400,
        records: 24,
        toolBytes: 128 * 1024
      })
      await measureOne(parent, {
        label: 'large',
        sessions: 800,
        records: 40,
        toolBytes: 256 * 1024
      })
      const hosts = 8
      const perHost: Corpus = { label: 'fanout', sessions: 180, records: 16, toolBytes: 96 * 1024 }
      const roots: string[] = []
      const generated = performance.now()
      for (let host = 0; host < hosts; host++) {
        const root = join(parent, `fan-${host}`)
        roots.push(root)
        await writeCorpus(root, perHost, host)
      }
      samples.push({
        label: 'fanout-generate',
        ms: Math.round(performance.now() - generated),
        sessions: hosts * perHost.sessions,
        heapMiB: memory().heapMiB,
        rssMiB: memory().rssMiB
      })
      resetSessionParseCacheForTests()
      const fanStarted = performance.now()
      const fan = await Promise.all(roots.map((root) => scanHost(root)))
      samples.push({
        label: 'fanout-upstream-parallel',
        ms: Math.round(performance.now() - fanStarted),
        sessions: fan.reduce((sum, result) => sum + result.sessions.length, 0),
        heapMiB: memory().heapMiB,
        rssMiB: memory().rssMiB
      })
      const repeatStarted = performance.now()
      const repeated = await Promise.all(roots.map((root) => scanHost(root)))
      samples.push({
        label: 'fanout-upstream-repeat',
        ms: Math.round(performance.now() - repeatStarted),
        sessions: repeated.reduce((sum, result) => sum + result.sessions.length, 0),
        heapMiB: memory().heapMiB,
        rssMiB: memory().rssMiB
      })
      const report = { hosts, foregroundWaitMs: FOREGROUND_WAIT_MS, samples }
      await writeFile('/tmp/ai-vault-measure.json', `${JSON.stringify(report, null, 2)}\n`)
      process.stdout.write(`AI_VAULT_MEASURE ${JSON.stringify(report)}\n`)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
