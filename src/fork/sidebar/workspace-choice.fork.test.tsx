import { describe, expect, it, vi } from 'vitest'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'

const onBox: Repo = {
  id: 'web',
  path: '/srv/web',
  displayName: 'web',
  badgeColor: '#000',
  addedAt: 0,
  connectionId: 'box',
  projectGroupId: 'g-box'
}
const group: ProjectGroup = {
  id: 'g-box',
  name: 'Services',
  parentPath: '/srv',
  executionHostId: 'ssh:box',
  parentGroupId: null,
  createdFrom: 'manual',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 0,
  updatedAt: 0
}

vi.mock('../../renderer/src/store', () => ({
  useAppStore: {
    getState: () => ({
      // A same-id local registration listed first must not stand in for the SSH one.
      repos: [{ ...onBox, connectionId: undefined, projectGroupId: undefined }, onBox],
      projectGroups: [group]
    })
  }
}))

import { formatRegisteredWorkspaceChoice } from '../../shared/fork-hooks/sidebar-chrome'
import { registerWorkspaceChoice } from './workspace-choice'

describe('workspace picker choice', () => {
  it('names the branch without refs/heads and the group of the row host', () => {
    registerWorkspaceChoice()
    const worktree: Worktree = {
      id: 'web::/srv/web/feature',
      repoId: 'web',
      path: '/srv/web/feature',
      branch: 'refs/heads/feature',
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
      displayName: 'feature',
      sortOrder: 0,
      lastActivityAt: 0,
      hostId: 'ssh:box'
    }
    const choice = formatRegisteredWorkspaceChoice(worktree)
    expect(choice?.label).toContain('feature · Services')
    expect(choice?.label).not.toContain('refs/heads/')
  })
})
