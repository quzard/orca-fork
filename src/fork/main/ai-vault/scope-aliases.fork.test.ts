import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { filterAiVaultSessions } from '../../../shared/ai-vault-session-filters'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import { resetAiVaultForkHooksForTests } from '../../../shared/fork-hooks/ai-vault'
import { parseAiVaultListResult } from '../../../main/ai-vault/session-list-result-validation'
import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import { matchForkCwdCandidates } from '../../../shared/fork-hooks/ai-vault-cwd'
import { attachScopePathAliases, expandScopePathAliases } from './scope-aliases'

const WORKSPACE = '/srv/wt/project'
const REAL_ROOT = '/srv/wt/real'

function session(cwd: string, cwdAliases?: string[]): AiVaultSession {
  const timestamp = '2026-01-01T00:00:00.000Z'
  return {
    id: 'codex:1',
    executionHostId: 'local',
    agent: 'codex',
    sessionId: '1',
    title: 'Rename the service',
    cwd,
    cwdAliases,
    branch: null,
    model: null,
    filePath: '/data/sessions/1.jsonl',
    codexHome: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    modifiedAt: timestamp,
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'codex resume 1',
    subagent: null
  }
}

describe('scope path aliases', () => {
  let root = ''

  afterEach(async () => {
    resetAiVaultForkHooksForTests()
    if (root) {
      await rm(root, { recursive: true, force: true })
      root = ''
    }
  })

  it('adds the real directory beside a symlink scope path', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-vault-alias-'))
    const target = join(root, 'project')
    const link = join(root, 'link')
    await mkdir(target)
    await symlink(target, link)

    const expanded = await expandScopePathAliases([link])
    // The added path is the real path: on macOS the tmpdir itself is /var -> /private/var.
    expect(expanded).toEqual([link, realpathSync(target)])
    expect(realpathSync(expanded[1]!)).toBe(expanded[1])
  })

  it('records a scope issue for a dangling link and aliases a resolved cwd', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-vault-alias-'))
    const target = join(root, 'project')
    const link = join(root, 'link')
    const dangling = join(root, 'missing')
    await mkdir(target)
    await symlink(target, link)
    await symlink(join(root, 'absent'), dangling)

    const scanned: {
      sessions: { cwd: string; cwdAliases?: string[] }[]
      issues: { kind?: string; path: string; message: string }[]
    } = { sessions: [{ cwd: `${target}/app` }], issues: [] }
    const result = await attachScopePathAliases(
      { scopePaths: [link, dangling] },
      async () => scanned
    )

    expect(result.sessions[0]?.cwdAliases).toEqual([`${link}/app`])
    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: 'scope',
        path: dangling,
        message: 'Scope path is not a directory.'
      })
    ])
  })

  it('stays silent for a scope path this host does not have, like another host workspace', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-vault-alias-'))
    const otherHostPath = join(root, 'home', 'remote-user', 'lite-lifecycle')
    const scanned = { sessions: [{ cwd: '/elsewhere' }], issues: [] }
    const result = await attachScopePathAliases(
      { scopePaths: [otherHostPath] },
      async () => scanned
    )

    expect(result.issues).toEqual([])
    expect(result.sessions).toEqual([{ cwd: '/elsewhere' }])
  })

  it('aliases a cwd spelled through another symlink, like macOS /var -> /private/var', async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-vault-alias-'))
    const privateVar = join(root, 'private-var')
    const varLink = join(root, 'var')
    await mkdir(join(privateVar, 'project'), { recursive: true })
    await symlink(privateVar, varLink)
    const link = join(varLink, 'link')
    await symlink(join(varLink, 'project'), link)

    // The transcript kept the /var spelling, and its app folder is gone.
    const scanned: {
      sessions: { cwd: string; cwdAliases?: string[] }[]
      issues: { kind?: string; path: string; message: string }[]
    } = { sessions: [{ cwd: `${varLink}/project/app` }, { cwd: `${root}/elsewhere` }], issues: [] }
    const result = await attachScopePathAliases({ scopePaths: [link] }, async () => scanned)

    expect(result.sessions[0]?.cwdAliases).toEqual([`${link}/app`])
    expect(result.sessions[1]?.cwdAliases).toBeUndefined()
    expect(result.issues).toEqual([])
  })

  it('matches a workspace through the alias when the transcript cwd is the real path', () => {
    const matched = filterAiVaultSessions([session(`${REAL_ROOT}/app`, [`${WORKSPACE}/app`])], {
      query: '',
      agents: ['codex'],
      scope: 'workspace',
      sort: 'updated',
      activeWorktreePaths: [WORKSPACE],
      hideEmptySessions: false
    })
    expect(matched).toHaveLength(1)

    const missed = filterAiVaultSessions([session(`${REAL_ROOT}/app`)], {
      query: '',
      agents: ['codex'],
      scope: 'workspace',
      sort: 'updated',
      activeWorktreePaths: [WORKSPACE],
      hideEmptySessions: false
    })
    expect(missed).toHaveLength(0)
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
