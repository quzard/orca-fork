import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { filterAiVaultSessions } from '../../shared/ai-vault-session-filters'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import { resetAiVaultForkHooksForTests } from '../../shared/fork-hooks/ai-vault'
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
    expect(expanded).toEqual([link, target])
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
})
