import { mkdtemp, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAiVaultListResult } from '../../main/ai-vault/session-list-result-validation'
import type { AiVaultScanIssue } from '../../shared/ai-vault-types'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { matchForkCwdCandidates } from '../../shared/fork-hooks/ai-vault-cwd'
import { scanWithScopePathAliases } from './scan-with-scope-aliases'
import { resolveLocalScopePathAliases, withScopePathAliases } from './scope-path-aliases'

describe('scope path aliases', () => {
  it('resolves a real symlink, records a dangling link, and keeps the resume cwd', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-scope-'))
    const real = join(root, 'project')
    const link = join(root, 'link')
    const dangling = join(root, 'dangling')
    await mkdir(real)
    await symlink(real, link)
    await symlink(join(root, 'missing'), dangling)
    const issues: AiVaultScanIssue[] = []

    const aliases = await resolveLocalScopePathAliases([link, dangling, real], issues)
    expect(aliases.get(link)).toBe(real)
    expect(aliases.has(real)).toBe(false)
    expect(issues).toEqual([expect.objectContaining({ kind: 'scope', path: dangling })])

    const sessions = withScopePathAliases(
      [{ cwd: join(real, 'app'), cwdAliases: undefined }],
      aliases
    )
    expect(sessions[0]?.cwd).toBe(join(real, 'app'))
    expect(sessions[0]?.cwdAliases).toEqual([join(link, 'app')])
  })

  it('expands the scan scope and stamps aliases without dropping the original sessions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-scope-scan-'))
    const real = join(root, 'project')
    const link = join(root, 'link')
    await mkdir(real)
    await symlink(real, link)
    const seen: string[][] = []
    const result = await scanWithScopePathAliases({ scopePaths: [link] }, async (options) => {
      seen.push([...(options.scopePaths ?? [])])
      return {
        sessions: [{ cwd: real, id: 'session-1' }],
        issues: []
      }
    })
    expect(seen).toEqual([[link, real]])
    expect(result.sessions[0]).toMatchObject({ cwd: real, cwdAliases: [link] })
  })

  it('prefers the more specific alias when a parent path also matches', () => {
    const candidates = [
      { path: '/home/user', length: '/home/user'.length },
      { path: '/home/user/link', length: '/home/user/link'.length }
    ]
    const owns = (candidate: { path: string }, cwd: string): boolean =>
      cwd === candidate.path || cwd.startsWith(`${candidate.path}/`)
    const ranked = matchForkCwdCandidates(
      {
        cwd: '/srv/wt/project/app',
        cwdAliases: ['/home/user/link/app']
      },
      candidates,
      {
        normalize: normalizeRuntimePathForComparison,
        owns,
        pathLength: (candidate) => candidate.length,
        tieBreak: (left, right) => right.length - left.length
      }
    )
    expect(ranked.map((candidate) => candidate.path)).toEqual(['/home/user/link', '/home/user'])
  })

  it('keeps cwd aliases through list validation and drops them when absent', () => {
    const parsed = parseAiVaultListResult({
      sessions: [{ ...validSession(), cwdAliases: ['/home/user/link'] }],
      issues: [],
      scannedAt: '2026-01-01T00:00:00.000Z'
    })
    expect(parsed.sessions[0]?.cwd).toBe('/home/user/project')
    expect(parsed.sessions[0]?.cwdAliases).toEqual(['/home/user/link'])
  })
})

function validSession(): Record<string, unknown> {
  return {
    id: 'local:cursor:session-1:/home/user/session.jsonl',
    executionHostId: 'local',
    executionHostPlatform: 'linux',
    agent: 'cursor',
    sessionId: 'session-1',
    title: 'Session',
    cwd: '/home/user/project',
    branch: null,
    model: null,
    filePath: '/home/user/session.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-01-01T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'cursor resume session-1',
    subagent: null
  }
}
