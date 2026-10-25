// 这个文件要 import 渲染进程的占位模块。node 工程只收 src/fork/**/*.ts，所以用 tsx，让 web 工程类型检查它。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { DEFAULT_REPO_BADGE_COLOR } from '../../shared/constants'
import { registerDurableWorkspaceArchive } from '../../shared/fork-hooks/workspace-durable-archive'
import { buildRuntimeSessionPlaceholders } from '../../renderer/src/store/terminals/workspace-terminal-placeholders'
import { addHydratedSshWorktreePlaceholders } from '../../renderer/src/store/terminals/workspace-terminal-ssh-placeholders'
import { runKnownSshWorktreeFetch } from '../../renderer/src/store/slices/worktrees/listing/known-ssh-worktree-fetch'
import {
  DURABLE_WORKSPACE_ARCHIVE_STORAGE_KEY,
  rememberWorkspaceArchive,
  stampWorkspaceArchive
} from './durable-workspace-archive'

const storage = new Map<string, string>()

const repo: Repo = {
  id: 'repo-1',
  path: '/repos/one',
  displayName: 'one',
  badgeColor: DEFAULT_REPO_BADGE_COLOR,
  addedAt: 0,
  connectionId: null,
  executionHostId: 'local'
}

function worktree(
  overrides: Partial<Worktree> & Pick<Worktree, 'id' | 'repoId' | 'path'>
): Worktree {
  return {
    hostId: 'local',
    displayName: 'checkout',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    head: '',
    branch: '',
    isBare: false,
    isMainWorktree: false,
    ...overrides
  }
}

describe('durable archive on placeholder rows', () => {
  beforeEach(() => {
    storage.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        }
      }
    })
    registerDurableWorkspaceArchive(stampWorkspaceArchive)
  })

  afterEach(() => {
    registerDurableWorkspaceArchive(undefined)
  })

  it('archives an SSH hydration placeholder on the same host', () => {
    const sshRepo: Repo = { ...repo, id: 'ssh-repo', connectionId: 'box', executionHostId: null }
    rememberWorkspaceArchive({
      id: 'ssh-repo::/repos/ssh',
      path: '/repos/ssh',
      repoId: 'ssh-repo',
      hostId: 'ssh:box',
      pathOnly: true
    })

    const placed = addHydratedSshWorktreePlaceholders(
      [sshRepo],
      {},
      {
        'ssh-repo::/repos/ssh': []
      }
    )

    expect(placed['ssh-repo']?.[0]?.isArchived).toBe(true)
    expect(storage.get(DURABLE_WORKSPACE_ARCHIVE_STORAGE_KEY)).toContain('"pathOnly":true')
  })

  it('leaves an SSH placeholder visible when the hide belongs to another host', () => {
    const sshRepo: Repo = { ...repo, id: 'ssh-repo', connectionId: 'box', executionHostId: null }
    rememberWorkspaceArchive({
      id: 'ssh-repo::/repos/ssh',
      path: '/repos/ssh',
      repoId: 'ssh-repo',
      hostId: 'ssh:other',
      pathOnly: true
    })

    const placed = addHydratedSshWorktreePlaceholders(
      [sshRepo],
      {},
      {
        'ssh-repo::/repos/ssh': []
      }
    )

    expect(placed['ssh-repo']?.[0]?.isArchived).toBe(false)
  })

  it('archives a runtime session placeholder on the same host', () => {
    rememberWorkspaceArchive({
      id: 'repo-2::/repos/two',
      path: '/repos/two',
      repoId: 'repo-2',
      hostId: 'runtime:host-1',
      pathOnly: true
    })

    const result = buildRuntimeSessionPlaceholders({
      repos: [repo],
      runtimeHostIdByWorkspaceSessionKey: { 'repo-2::/repos/two': 'runtime:host-1' },
      worktreesByRepo: {}
    })

    expect(result.worktreesByRepo['repo-2']?.[0]?.isArchived).toBe(true)
  })

  it('archives a known SSH fallback row before it is appended', async () => {
    const sshRepo: Repo = {
      ...repo,
      connectionId: 'box',
      executionHostId: 'ssh:box'
    }
    const checkout = worktree({
      id: 'repo-1::/repos/ssh',
      repoId: 'repo-1',
      path: '/repos/ssh',
      hostId: 'ssh:box'
    })
    rememberWorkspaceArchive({
      id: checkout.id,
      path: checkout.path,
      repoId: checkout.repoId,
      hostId: 'ssh:box',
      pathOnly: true
    })
    const state = {
      repos: [sshRepo],
      worktreesByRepo: {} as Record<string, Worktree[]>,
      detectedWorktreesByRepo: {},
      projectHostSetups: [],
      sshConnectionStates: new Map(),
      sortEpoch: 0
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        api: {
          worktrees: {
            listKnownForExecutionHost: async () => ({
              status: 'complete',
              repoId: 'repo-1',
              executionHostId: 'ssh:box',
              result: {
                repoId: 'repo-1',
                authoritative: false,
                source: 'metadata-fallback',
                worktrees: [
                  {
                    ...checkout,
                    ownership: 'unknown-legacy',
                    selectedCheckout: false,
                    visible: true
                  }
                ]
              }
            })
          }
        }
      }
    })

    await runKnownSshWorktreeFetch(
      (updater) => {
        if (typeof updater === 'function') {
          Object.assign(state, updater(state))
        }
      },
      'repo-1',
      'ssh:box'
    )

    expect(state.worktreesByRepo['repo-1']?.[0]?.isArchived).toBe(true)
  })
})
