import { describe, expect, it, vi } from 'vitest'
import { normalizeExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import {
  emptyProjectSectionKey,
  hostDirectorySectionKey,
  looseHostSectionKey
} from './section-keys'
import {
  commitGroupDrop,
  planGroupDropItems,
  resolveGroupDropTarget,
  type GroupDropState,
  type GroupDropWriter
} from './workspace-group-drop-plan'

function hostId(value: string): ExecutionHostId {
  const id = normalizeExecutionHostId(value)
  if (!id) {
    throw new Error(`Unusable host id: ${value}`)
  }
  return id
}

const DEVBOX = hostId('ssh:devbox')
const MINI = hostId('ssh:mini')

const repos: Repo[] = [
  {
    id: 'r1',
    path: '/srv/r1',
    displayName: 'r1',
    badgeColor: '#737373',
    addedAt: 0,
    executionHostId: DEVBOX,
    projectGroupId: 'g-dev'
  },
  {
    id: 'r2',
    path: '/srv/r2',
    displayName: 'r2',
    badgeColor: '#737373',
    addedAt: 0,
    executionHostId: MINI
  }
]

function worktree(
  id: string,
  repoId: string,
  host: ExecutionHostId,
  extra: Partial<Worktree> = {}
): Worktree {
  return {
    id,
    repoId,
    path: `/srv/${id}`,
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
    displayName: id,
    sortOrder: 0,
    lastActivityAt: 0,
    hostId: host,
    ...extra
  }
}

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

const folder: FolderWorkspace = {
  id: 'f1',
  projectGroupId: 'g-dev',
  name: 'notes',
  folderPath: '/srv/notes',
  executionHostId: DEVBOX,
  linkedTask: null,
  comment: '',
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  sidebarGroupId: 'g-dev',
  manualOrder: 5,
  lastActivityAt: 0,
  createdAt: 0,
  updatedAt: 0
}

function state(): GroupDropState {
  const worktrees = [
    worktree('w-inherit', 'r1', DEVBOX),
    worktree('w-explicit', 'r1', DEVBOX, { sidebarGroupId: null, manualOrder: 9 }),
    worktree('w-mini', 'r2', MINI)
  ]
  return {
    worktreesByRepo: { r1: worktrees.slice(0, 2), r2: worktrees.slice(2) },
    repos,
    folderWorkspaces: [folder],
    projectGroups: [group('g-dev', DEVBOX), group('g-other', DEVBOX), group('g-mini', MINI)],
    getKnownWorktreeById: (id, host) =>
      worktrees.find((entry) => entry.id === id && (!host || entry.hostId === host))
  }
}

function writer(failIds: readonly string[] = []) {
  const calls: { kind: string; id: string; fields: unknown }[] = []
  const api: GroupDropWriter = {
    updateWorktreeMeta: vi.fn(async (id, fields) => {
      calls.push({ kind: 'worktree', id, fields })
      return failIds.includes(id) && calls.filter((c) => c.id === id).length === 1
        ? { ok: false as const, error: `no ${id}` }
        : { ok: true as const }
    }),
    updateFolderWorkspace: vi.fn(async (id, fields) => {
      calls.push({ kind: 'folder', id, fields })
      return !(failIds.includes(id) && calls.filter((c) => c.id === id).length === 1)
    }),
    setSortBy: vi.fn()
  }
  return { api, calls }
}

describe('empty project header drop target', () => {
  it('never writes the header slot as a group id: it is the host loose list', () => {
    const key = emptyProjectSectionKey(DEVBOX, 'r9')
    expect(resolveGroupDropTarget(state(), DEVBOX, 'empty:r9', key)).toEqual({
      groupId: null,
      key: looseHostSectionKey(DEVBOX)
    })
  })

  it('keeps a real group on the same host and refuses one saved on another host', () => {
    const key = hostDirectorySectionKey(DEVBOX, 'g-other')
    expect(resolveGroupDropTarget(state(), DEVBOX, 'g-other', key)).toEqual({
      groupId: 'g-other',
      key
    })
    expect(resolveGroupDropTarget(state(), DEVBOX, 'g-mini', key)).toHaveProperty('error')
    expect(resolveGroupDropTarget(state(), DEVBOX, 'missing', key)).toHaveProperty('error')
  })
})

describe('multi-row group drop', () => {
  const target = { groupId: 'g-other', key: hostDirectorySectionKey(DEVBOX, 'g-other') }
  const order = new Map([
    ['w-inherit', { manualOrder: 100 }],
    ['w-explicit', { manualOrder: 99 }],
    [folderWorkspaceKey('f1'), { manualOrder: 98 }]
  ])

  it('plans nothing when any dragged row is on another host', () => {
    const items = planGroupDropItems(state(), DEVBOX, target, ['w-inherit', 'w-mini'], order)
    expect(items).toHaveProperty('error')
  })

  it('plans nothing when a dragged row is unknown', () => {
    expect(
      planGroupDropItems(state(), DEVBOX, target, ['w-inherit', 'gone'], order)
    ).toHaveProperty('error')
  })

  it('writes every row with the real group and switches to manual sort', async () => {
    const items = planGroupDropItems(
      state(),
      DEVBOX,
      target,
      ['w-inherit', 'w-explicit', folderWorkspaceKey('f1')],
      order
    )
    if ('error' in items) {
      throw new Error(items.error)
    }
    const { api, calls } = writer()
    await expect(commitGroupDrop(api, DEVBOX, items)).resolves.toBeNull()
    expect(calls).toEqual([
      {
        kind: 'worktree',
        id: 'w-inherit',
        fields: { sidebarGroupId: 'g-other', manualOrder: 100 }
      },
      {
        kind: 'worktree',
        id: 'w-explicit',
        fields: { sidebarGroupId: 'g-other', manualOrder: 99 }
      },
      { kind: 'folder', id: 'f1', fields: { sidebarGroupId: 'g-other', manualOrder: 98 } }
    ])
    expect(api.setSortBy).toHaveBeenCalledWith('manual')
  })

  it('puts back the rows that landed when one write fails', async () => {
    const items = planGroupDropItems(
      state(),
      DEVBOX,
      target,
      ['w-inherit', 'w-explicit', folderWorkspaceKey('f1')],
      order
    )
    if ('error' in items) {
      throw new Error(items.error)
    }
    const { api, calls } = writer(['w-explicit'])
    await expect(commitGroupDrop(api, DEVBOX, items)).resolves.toBe('no w-explicit')
    expect(calls.slice(3)).toEqual([
      // inherited g-dev is written back explicitly; it renders in the same section
      { kind: 'worktree', id: 'w-inherit', fields: { sidebarGroupId: 'g-dev' } },
      { kind: 'folder', id: 'f1', fields: { sidebarGroupId: 'g-dev', manualOrder: 5 } }
    ])
    expect(api.setSortBy).not.toHaveBeenCalled()
  })
})
