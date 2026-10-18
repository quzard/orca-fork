// F022 after upstream moved scope checks to the file-path-aware matcher (ai-vault-scope-cwd-match):
// a session whose recorded cwd is the real path still matches a symlinked workspace through its
// cwd alias, in the scoped depth cut and in project attribution, and the attribution cache keeps an
// aliased session apart from one with the same cwd and no alias.
import { describe, expect, it } from 'vitest'
import { truncateAiVaultListResult } from '../../shared/ai-vault-session-depth'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { buildAiVaultSessionProjectById } from '../../renderer/src/components/right-sidebar/ai-vault-session-projects'

const LINK = '/srv/wt/project'
const REAL = '/srv/wt/real'

function session(id: string, cwd: string, cwdAliases?: string[]): AiVaultSession {
  const timestamp = '2026-01-01T00:00:00.000Z'
  return {
    id,
    executionHostId: 'local',
    agent: 'codex',
    sessionId: id,
    title: 'Session',
    cwd,
    ...(cwdAliases ? { cwdAliases } : {}),
    branch: null,
    model: null,
    filePath: `/data/sessions/${id}.jsonl`,
    codexHome: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    modifiedAt: timestamp,
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: `codex resume ${id}`,
    subagent: null
  }
}

const repo: Repo = {
  id: 'repo-1',
  path: LINK,
  displayName: 'Project',
  badgeColor: '#737373',
  addedAt: 1
}

const worktree: Worktree = {
  id: 'wt-1',
  repoId: repo.id,
  displayName: 'main',
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 1,
  path: LINK,
  head: 'abc123',
  branch: 'main',
  isBare: false,
  isMainWorktree: true
}

describe('symlink cwd aliases with the file-path scope matcher', () => {
  it('keeps an aliased in-scope session in the scoped depth cut', () => {
    const result = {
      sessions: [
        session('newest', '/elsewhere'),
        session('aliased', `${REAL}/app`, [`${LINK}/app`]),
        session('plain', `${REAL}/app`)
      ],
      issues: [],
      scannedAt: '2026-01-01T00:00:00.000Z'
    }
    const cut = truncateAiVaultListResult(result, 1, [LINK])
    expect(cut.sessions.map((entry) => entry.id)).toEqual(['newest', 'aliased'])
  })

  it('attributes the real-path cwd to the symlinked workspace, apart from an unaliased twin', () => {
    const projects = buildAiVaultSessionProjectById({
      repos: [repo],
      worktrees: [worktree],
      projectHostSetupProjection: { projects: [], setups: [] },
      sessions: [
        session('aliased', `${REAL}/app`, [`${LINK}/app`]),
        session('plain', `${REAL}/app`)
      ]
    })
    expect(projects.get('aliased')).toMatchObject({ kind: 'repo', key: 'repo:repo-1' })
    expect(projects.get('plain')?.kind).toBe('folder')
  })
})
