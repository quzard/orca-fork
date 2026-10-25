// 导入和外部收件箱走渲染进程。node 工程只收 src/fork/**/*.ts，
// 这个测试改成 tsx，由 web 工程类型检查；同路径扫描仍留在 .fork.test.ts。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importNewExternalWorktreeInboxPaths } from '../../renderer/src/components/sidebar/new-external-worktrees-inbox-actions'
import {
  registerDurableWorkspaceMetaReactivate,
  type DurableArchiveRow
} from '../../shared/fork-hooks/workspace-durable-archive'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { applyForkPostImport } from '../import/apply-post-import'
import {
  forgetWorkspaceArchive,
  rememberWorkspaceArchive,
  stampWorkspaceArchive
} from './durable-workspace-archive'
import { reactivateArchivedWorktreeMeta } from './reused-path-worktree-meta'

const PATH = '/srv/wt/project/checkout'
const ID = `repo-1::${PATH}`

const storage = new Map<string, string>()

function archivedMeta(instanceId = 'stale-instance'): WorktreeMeta {
  return {
    displayName: 'recreate-g',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: true,
    isUnread: false,
    isPinned: false,
    sortOrder: 1,
    lastActivityAt: 1,
    instanceId
  }
}

// 盖住隐藏记录用的行。渲染进程测试不能调用 main 的 mergeWorktree。
function archiveRow(meta: WorktreeMeta): DurableArchiveRow {
  return {
    id: ID,
    path: PATH,
    repoId: 'repo-1',
    hostId: 'local',
    isArchived: meta.isArchived
  }
}

describe('same-path import after soft-delete', () => {
  let meta: WorktreeMeta
  let updateMeta: ReturnType<typeof vi.fn>

  beforeEach(() => {
    meta = archivedMeta()
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
    // 测试替身只套用 updates。真正的合并在 main，不进这个工程。
    updateMeta = vi.fn(async (args: { updates: Partial<WorktreeMeta> }) => {
      meta = { ...meta, ...args.updates }
      return meta
    })
    vi.stubGlobal('window', { api: { worktrees: { updateMeta } } })
    registerDurableWorkspaceMetaReactivate(reactivateArchivedWorktreeMeta)
    rememberWorkspaceArchive({
      id: ID,
      path: PATH,
      repoId: 'repo-1',
      hostId: 'local',
      pathOnly: false
    })
  })

  afterEach(() => {
    registerDurableWorkspaceMetaReactivate(undefined)
    vi.unstubAllGlobals()
  })

  it('imports the same path into the active sidebar after the hide list is cleared', async () => {
    forgetWorkspaceArchive({
      id: ID,
      path: PATH,
      repoId: 'repo-1',
      hostId: 'local',
      isArchived: true
    })

    await applyForkPostImport({
      phase: 'registered',
      repoId: 'repo-1',
      path: PATH,
      executionHostId: 'local'
    })

    const imported = archiveRow(meta)
    expect(updateMeta).toHaveBeenCalledWith({
      worktreeId: ID,
      executionHostId: 'local',
      updates: { isArchived: false }
    })
    expect(imported.isArchived).toBe(false)
    expect(stampWorkspaceArchive([imported])[0]?.isArchived).toBe(false)
  })

  it('clears archived meta before the external inbox rescans', async () => {
    forgetWorkspaceArchive({
      id: ID,
      path: PATH,
      repoId: 'repo-1',
      hostId: 'local',
      isArchived: true
    })
    const fetchWorktrees = vi.fn(async () => {
      expect(meta.isArchived).toBe(false)
      return true
    })

    await importNewExternalWorktreeInboxPaths({
      projectId: 'repo-1',
      repo: {
        importedExternalWorktreePaths: [],
        externalWorktreeInboxBaselinePaths: [],
        executionHostId: 'local'
      },
      worktreePaths: [PATH],
      setInboxState: vi.fn(),
      updateRepo: vi.fn().mockResolvedValue(true),
      fetchWorktrees
    })

    expect(fetchWorktrees).toHaveBeenCalledOnce()
    expect(stampWorkspaceArchive([archiveRow(meta)])[0]?.isArchived).toBe(false)
  })

  it('keeps the hide when clearing archived meta fails', async () => {
    updateMeta.mockRejectedValueOnce(new Error('disk'))
    const fetchWorktrees = vi.fn().mockResolvedValue(true)
    const updateRepo = vi.fn().mockResolvedValue(true)

    await importNewExternalWorktreeInboxPaths({
      projectId: 'repo-1',
      repo: {
        importedExternalWorktreePaths: [],
        externalWorktreeInboxBaselinePaths: [],
        executionHostId: 'local'
      },
      worktreePaths: [PATH],
      setInboxState: vi.fn(),
      updateRepo,
      fetchWorktrees
    })

    expect(fetchWorktrees).not.toHaveBeenCalled()
    expect(updateRepo).toHaveBeenCalledTimes(2)
    expect(meta.isArchived).toBe(true)
    const unarchivedScan = archiveRow({ ...archivedMeta(), isArchived: false })
    expect(stampWorkspaceArchive([unarchivedScan])[0]?.isArchived).toBe(true)
  })
})
