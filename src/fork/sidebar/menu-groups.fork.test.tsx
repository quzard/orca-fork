import { describe, expect, it, vi } from 'vitest'
import { normalizeExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import {
  registerWorktreeMenuGroups,
  worktreeMenuGroups
} from '../../shared/fork-hooks/worktree-menu-groups'
import { hostDirectoryMenuGroups, workspaceMenuGroupState } from './menu-groups'
import { setHostDirectoryDefaultHostId } from './section-keys'

const LOCAL = normalizeExecutionHostId('local') as ExecutionHostId
const DEVBOX = normalizeExecutionHostId('ssh:devbox') as ExecutionHostId

function group(id: string, host: ExecutionHostId): ProjectGroup {
  return {
    id,
    name: id,
    parentPath: '/srv',
    executionHostId: host,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0
  }
}

const groups = [group('g-dev', DEVBOX), group('g-dev-2', DEVBOX), group('g-local', LOCAL)]

const repo: Repo = {
  id: 'r1',
  path: '/srv/r1',
  displayName: 'r1',
  badgeColor: '#737373',
  addedAt: 0,
  executionHostId: DEVBOX,
  projectGroupId: 'g-dev'
}

function worktree(extra: Partial<Worktree> = {}): Worktree {
  return {
    id: 'w1',
    repoId: 'r1',
    path: '/srv/w1',
    branch: 'refs/heads/main',
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
    displayName: 'w1',
    sortOrder: 0,
    lastActivityAt: 0,
    hostId: DEVBOX,
    ...extra
  }
}

function state(extra: Partial<Worktree>) {
  return workspaceMenuGroupState({
    worktree: worktree(extra),
    repo,
    projectGroups: groups,
    defaultHostId: LOCAL
  })
}

describe('workspace menu groups', () => {
  it('lists only groups saved on the workspace host', () => {
    expect(state({}).groups.map((entry) => entry.id)).toEqual(['g-dev', 'g-dev-2'])
  })

  it('uses the inherited project group when the workspace has none of its own', () => {
    expect(state({}).currentGroupId).toBe('g-dev')
  })

  it('treats an explicit null as ungrouped even when the project has a group', () => {
    expect(state({ sidebarGroupId: null }).currentGroupId).toBeNull()
  })

  it('treats a deleted group id as ungrouped, without falling back to the project group', () => {
    expect(state({ sidebarGroupId: 'deleted' }).currentGroupId).toBeNull()
  })

  it('treats a group saved on another host as ungrouped', () => {
    expect(state({ sidebarGroupId: 'g-local' }).currentGroupId).toBeNull()
  })

  it('keeps an explicit group on the same host', () => {
    expect(state({ sidebarGroupId: 'g-dev-2' }).currentGroupId).toBe('g-dev-2')
  })
})

describe('host-directory menu actions', () => {
  setHostDirectoryDefaultHostId(LOCAL)
  const args = (extra: Partial<Worktree>) => ({
    worktree: worktree(extra),
    repo,
    projectGroups: groups,
    handleMoveProjectToGroup: vi.fn(),
    handleRemoveProjectFromGroup: vi.fn()
  })

  it('hides "Remove from group" for an explicitly ungrouped workspace', () => {
    const menu = hostDirectoryMenuGroups(args({ sidebarGroupId: null }), vi.fn())
    expect(menu.currentGroupId).toBeNull()
  })

  it('moves the workspace itself, not the project', () => {
    const move = vi.fn()
    const input = args({ sidebarGroupId: null })
    const menu = hostDirectoryMenuGroups(input, move)
    menu.onMove('g-dev')
    expect(move).toHaveBeenCalledWith('w1', DEVBOX, 'g-dev')
    expect(input.handleMoveProjectToGroup).not.toHaveBeenCalled()
  })

  it('removes the workspace from its effective group and ignores a move to that group', () => {
    const move = vi.fn()
    const menu = hostDirectoryMenuGroups(args({ sidebarGroupId: 'g-dev-2' }), move)
    menu.onMove('g-dev-2')
    expect(move).not.toHaveBeenCalled()
    menu.onRemove()
    expect(move).toHaveBeenCalledWith('w1', DEVBOX, null)
  })
})

describe('unregistered menu groups hook', () => {
  it("returns upstream's values unchanged", () => {
    registerWorktreeMenuGroups(undefined)
    const onMove = vi.fn()
    const onRemove = vi.fn()
    const menu = worktreeMenuGroups({
      worktree: worktree({ sidebarGroupId: null }),
      repo,
      projectGroups: groups,
      handleMoveProjectToGroup: onMove,
      handleRemoveProjectFromGroup: onRemove
    })
    expect(menu).toEqual({ groups, currentGroupId: 'g-dev', onMove, onRemove })
  })
})
