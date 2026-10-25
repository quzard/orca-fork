import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionHostId } from '../../shared/execution-host'
import { registerWorkspaceFolderDelete } from '../../shared/fork-hooks/workspace-folder-delete'
import { registerForkWorkspaceFolderDelete } from './workspace-folder-delete'

type Row = {
  id: string
  instanceId: string
  repoId: string
  path: string
  displayName: string
  isMainWorktree: boolean
  hostId?: ExecutionHostId
}

const mocks = vi.hoisted(() => {
  const worktreeMap = new Map<string, Row>()
  const state = {
    settings: { skipDeleteWorktreeConfirm: true },
    worktreeMap,
    repos: [] as { id: string; displayName: string; kind?: 'folder' }[],
    worktreeLineageById: {},
    allWorktrees: () => Array.from(worktreeMap.values()),
    clearWorktreeDeleteState: vi.fn(),
    markWorktreesDeleting: vi.fn(),
    openModal: vi.fn(),
    removeWorktree: vi.fn().mockResolvedValue({ ok: true }),
    updateWorktreeMeta: vi.fn(async () => ({ ok: true })),
    shutdownWorktreeBrowsers: vi.fn(async () => undefined),
    shutdownWorktreeTerminals: vi.fn(async () => undefined),
    setActiveWorktree: vi.fn(),
    activeWorktreeId: null as string | null,
    worktreesByRepo: {} as Record<string, Row[]>,
    gitStatusByWorktree: {} as Record<string, unknown[]>,
    deleteStateByWorktreeId: {} as Record<string, { isDeleting: boolean }>,
    openFiles: [] as [],
    editorDrafts: {},
    editorBufferIdOf: {},
    editorBufferViews: {},
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map(),
    getKnownWorktreeById: (id: string, hostId?: string): Row | undefined => {
      const row = worktreeMap.get(id)
      return row && (!hostId || row.hostId === hostId) ? row : undefined
    }
  }
  const setState = vi.fn()
  return { state, setState }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    {
      getState: () => mocks.state,
      setState: mocks.setState
    }
  )
}))

vi.mock('@/store/selectors', () => ({
  getAllWorktreesFromState: () => Array.from(mocks.state.worktreeMap.values()),
  getWorktreeMapFromState: () => mocks.state.worktreeMap,
  getWorktreeOnHostFromState: (_state: unknown, worktreeId: string, hostId?: string) => {
    const row = mocks.state.worktreeMap.get(worktreeId)
    return row && (!hostId || row.hostId === hostId) ? row : undefined
  }
}))

vi.mock('@/components/editor/editor-model-owner', () => ({
  resolveEditorModelOwner: () => ({ environmentId: null, hostId: 'local' }),
  getEditorModelOwnerKey: () => ''
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() }
}))

import {
  runWorktreeBatchDelete,
  runWorktreeDelete
} from '@/components/sidebar/delete-worktree-flow'

function setWorktrees(worktrees: { id: string; repoId?: string; path?: string }[]): void {
  mocks.state.worktreeMap.clear()
  for (const worktree of worktrees) {
    mocks.state.worktreeMap.set(worktree.id, {
      id: worktree.id,
      instanceId: `${worktree.id}-instance`,
      repoId: worktree.repoId ?? 'repo-1',
      path: worktree.path ?? `/srv/wt/project/${worktree.id}`,
      displayName: worktree.id,
      isMainWorktree: false
    })
  }
}

describe('skip-confirm workspace removal', () => {
  beforeEach(() => {
    mocks.state.settings = { skipDeleteWorktreeConfirm: true }
    mocks.state.repos = [{ id: 'repo-1', displayName: 'project' }]
    mocks.state.worktreeLineageById = {}
    mocks.state.openFiles = []
    mocks.state.removeWorktree.mockClear().mockResolvedValue({ ok: true })
    mocks.state.updateWorktreeMeta.mockClear().mockResolvedValue({ ok: true })
    mocks.state.openModal.mockClear()
    mocks.setState.mockClear()
    setWorktrees([])
    registerWorkspaceFolderDelete(undefined)
  })

  afterEach(() => {
    registerWorkspaceFolderDelete(undefined)
  })

  it('still hard-deletes when the hook is not registered', () => {
    setWorktrees([{ id: 'wt-1' }])

    runWorktreeDelete('wt-1')

    expect(mocks.state.removeWorktree).toHaveBeenCalledWith(
      { id: 'wt-1', executionHostId: null },
      false
    )
    expect(mocks.state.updateWorktreeMeta).not.toHaveBeenCalled()
    expect(mocks.state.openModal).not.toHaveBeenCalled()
  })

  it('archives a git workspace instead of deleting it when confirmation is skipped', async () => {
    registerForkWorkspaceFolderDelete()
    setWorktrees([{ id: 'wt-1' }])

    runWorktreeDelete('wt-1')

    await vi.waitFor(() => {
      expect(mocks.state.updateWorktreeMeta).toHaveBeenCalledWith(
        'wt-1',
        { isArchived: true },
        { executionHostId: 'local' }
      )
    })
    expect(mocks.state.removeWorktree).not.toHaveBeenCalled()
    expect(mocks.state.openModal).not.toHaveBeenCalled()
  })

  it('still removes a folder workspace through the existing record path', async () => {
    registerForkWorkspaceFolderDelete()
    mocks.state.repos = [{ id: 'folder-repo', displayName: 'folder', kind: 'folder' }]
    setWorktrees([{ id: 'wt-1', repoId: 'folder-repo', path: '/srv/wt/folder' }])

    expect(runWorktreeBatchDelete(['wt-1'])).toBe(true)

    await vi.waitFor(() => {
      expect(mocks.state.removeWorktree).toHaveBeenCalledWith(
        { id: 'wt-1', executionHostId: null },
        false
      )
    })
    expect(mocks.state.updateWorktreeMeta).not.toHaveBeenCalled()
  })

  it('drops an orphan row from the list without deleting the directory', async () => {
    registerForkWorkspaceFolderDelete()
    mocks.state.repos = []
    setWorktrees([{ id: 'orphan' }])
    const row = mocks.state.worktreeMap.get('orphan')
    mocks.state.worktreesByRepo = row ? { 'repo-1': [row] } : {}

    runWorktreeDelete('orphan')

    await vi.waitFor(() => {
      expect(mocks.setState).toHaveBeenCalled()
    })
    expect(mocks.state.updateWorktreeMeta).not.toHaveBeenCalled()
    expect(mocks.state.removeWorktree).not.toHaveBeenCalled()
  })
})
