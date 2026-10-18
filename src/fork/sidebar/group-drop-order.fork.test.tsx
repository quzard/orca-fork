import { describe, expect, it } from 'vitest'
import { normalizeExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { Worktree } from '../../shared/worktree/types'
import { hostDirectorySectionKey, looseHostSectionKey } from './section-keys'
import { buildGroupDropOrder, type GroupDropState } from './workspace-group-drop-plan'

const HOST = normalizeExecutionHostId('ssh:devbox') as ExecutionHostId
const LOOSE = looseHostSectionKey(HOST)
const GROUP = hostDirectorySectionKey(HOST, 'g1')

function row(id: string, extra: Partial<Worktree>): Worktree {
  return {
    id,
    repoId: 'r1',
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
    hostId: HOST,
    ...extra
  }
}

// The ungrouped rows have never been dragged: they sort by sortOrder and have no manual order.
const rows = [
  row('moved', { sidebarGroupId: 'g1', sortOrder: 900 }),
  row('a', { sortOrder: 800 }),
  row('b', { sortOrder: 500 }),
  row('c', { sortOrder: 100, manualOrder: 300 })
]

const state: GroupDropState = {
  worktreesByRepo: { r1: rows },
  repos: [],
  folderWorkspaces: [],
  projectGroups: [],
  getKnownWorktreeById: (id) => rows.find((entry) => entry.id === id)
}

const groups = [
  { key: GROUP, worktreeIds: ['moved'] },
  { key: LOOSE, worktreeIds: ['a', 'b', 'c'] }
]

function order(dropIndex: number) {
  return buildGroupDropOrder(
    state,
    groups,
    { groupId: null, key: LOOSE },
    ['moved'],
    dropIndex,
    () => false,
    10_000
  )
}

describe('group drop order', () => {
  it('writes only the moved row, between its new neighbours', () => {
    const updates = order(1)
    expect([...updates.keys()]).toEqual(['moved'])
    const rank = updates.get('moved')!.manualOrder
    // a sorts at 800 (sortOrder), b at 500: the moved row lands between them, nobody else moves.
    expect(rank).toBeLessThan(800)
    expect(rank).toBeGreaterThan(500)
  })

  it('uses a neighbour manual order when it has one', () => {
    const rank = order(3).get('moved')!.manualOrder
    expect(rank).toBeLessThan(300)
  })

  it('goes above the first row and below the last one', () => {
    expect(order(0).get('moved')!.manualOrder).toBeGreaterThan(800)
    expect(order(2).get('moved')!.manualOrder).toBeGreaterThan(300)
    expect(order(2).get('moved')!.manualOrder).toBeLessThan(500)
  })

  it('keeps several moved rows in order without renumbering the others', () => {
    const updates = buildGroupDropOrder(
      state,
      [
        { key: GROUP, worktreeIds: ['moved', 'a'] },
        { key: LOOSE, worktreeIds: ['b', 'c'] }
      ],
      { groupId: null, key: LOOSE },
      ['moved', 'a'],
      1,
      () => false,
      10_000
    )
    expect([...updates.keys()]).toEqual(['moved', 'a'])
    const [first, second] = [updates.get('moved')!.manualOrder, updates.get('a')!.manualOrder]
    expect(first).toBeLessThan(500)
    expect(first).toBeGreaterThan(second)
    expect(second).toBeGreaterThan(300)
  })

  it('takes the shared key when both neighbours tie, instead of renumbering', () => {
    const tied = [
      row('moved', { sortOrder: 1 }),
      row('x', { sortOrder: 50 }),
      row('y', { sortOrder: 50 })
    ]
    const updates = buildGroupDropOrder(
      { ...state, worktreesByRepo: { r1: tied } },
      [
        { key: GROUP, worktreeIds: ['moved'] },
        { key: LOOSE, worktreeIds: ['x', 'y'] }
      ],
      { groupId: null, key: LOOSE },
      ['moved'],
      1,
      () => false,
      10_000
    )
    expect([...updates.entries()]).toEqual([['moved', { manualOrder: 50 }]])
  })

  it('ranks into an empty group', () => {
    const updates = buildGroupDropOrder(
      state,
      groups,
      { groupId: 'g2', key: hostDirectorySectionKey(HOST, 'g2') },
      ['a'],
      0,
      () => false,
      10_000
    )
    expect([...updates.entries()]).toEqual([['a', { manualOrder: 10_000 }]])
  })
})
