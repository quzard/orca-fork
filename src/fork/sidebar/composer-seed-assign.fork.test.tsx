import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'

const mocks = vi.hoisted(() => ({
  state: {
    repos: [] as Repo[],
    projectGroups: [] as ProjectGroup[],
    worktreesByRepo: {} as Record<string, Worktree[]>,
    updateWorktreeMeta: vi.fn(async () => ({ ok: true }))
  }
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => undefined, { getState: () => mocks.state })
}))

import { applyRegisteredSidebarGroup } from '../../shared/fork-hooks/workspace-composer-seed'
import { registerComposerSeed } from './register-composer-seed'

function group(id: string, executionHostId: string | null): ProjectGroup {
  return {
    id,
    name: id,
    parentPath: '/srv',
    executionHostId,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0
  }
}

function created(hostId: Worktree['hostId']): Worktree {
  return {
    id: 'web::/srv/web/new',
    repoId: 'web',
    path: '/srv/web/new',
    branch: 'refs/heads/new',
    head: 'abc',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    comment: '',
    isUnread: false,
    isPinned: false,
    displayName: 'new',
    sortOrder: 0,
    lastActivityAt: 0,
    hostId
  }
}

describe('group assigned after a create from the composer', () => {
  beforeEach(() => {
    mocks.state.updateWorktreeMeta.mockClear()
    mocks.state.repos = [
      { id: 'web', path: '/srv/web', displayName: 'web', badgeColor: '#000', addedAt: 0 }
    ]
    mocks.state.projectGroups = [group('on-box', 'ssh:box'), group('on-mac', 'local')]
    mocks.state.worktreesByRepo = { web: [created('local')] }
    registerComposerSeed()
  })

  it('writes the group when it lives on the created workspace host', async () => {
    await applyRegisteredSidebarGroup('web::/srv/web/new', 'on-mac', 'local')
    expect(mocks.state.updateWorktreeMeta).toHaveBeenCalledWith(
      'web::/srv/web/new',
      { sidebarGroupId: 'on-mac' },
      { executionHostId: 'local' }
    )
  })

  it('skips a group of another host (the composer switched project after opening)', async () => {
    await applyRegisteredSidebarGroup('web::/srv/web/new', 'on-box', 'local')
    expect(mocks.state.updateWorktreeMeta).not.toHaveBeenCalled()
  })
})
