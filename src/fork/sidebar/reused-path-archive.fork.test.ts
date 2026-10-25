import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeWorktree } from '../../main/ipc/worktree-metadata-merge'
import { mergeWorktreeMetaForWrite } from '../../main/persistence/loading-store/worktree-meta-write-normalization'
import { buildProvisionedRootMeta } from '../../main/provisioned-root-checkout'
import {
  registerDurableWorkspaceMetaReactivate,
  reactivateRegisteredArchivedWorktreeMeta
} from '../../shared/fork-hooks/workspace-durable-archive'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { withoutReusedWorktreeArchive } from '../../shared/worktree/reused-path-archive'
import { importNewExternalWorktreeInboxPaths } from '../../renderer/src/components/sidebar/new-external-worktrees-inbox-actions'
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

function scannedRow(meta: WorktreeMeta) {
  return mergeWorktree(
    'repo-1',
    {
      path: PATH,
      head: 'abc',
      branch: 'recreate-g',
      isBare: false,
      isMainWorktree: false
    },
    meta
  )
}

describe('same-path recreate after soft-delete', () => {
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
    updateMeta = vi.fn(async (args: { updates: Partial<WorktreeMeta> }) => {
      meta = mergeWorktreeMetaForWrite(meta, args.updates)
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

  it('stays archived after the hide list is cleared until create resets the reused meta', () => {
    forgetWorkspaceArchive({
      id: ID,
      path: PATH,
      repoId: 'repo-1',
      hostId: 'local',
      isArchived: true
    })
    expect(scannedRow(meta).isArchived).toBe(true)
    expect(stampWorkspaceArchive([scannedRow(meta)])[0]?.isArchived).toBe(true)

    meta = mergeWorktreeMetaForWrite(
      meta,
      withoutReusedWorktreeArchive({ instanceId: 'fresh-instance', orcaCreationSource: 'desktop' })
    )
    const created = scannedRow(meta)
    expect(created.isArchived).toBe(false)
    expect(created.instanceId).toBe('fresh-instance')
    expect(stampWorkspaceArchive([created])[0]?.isArchived).toBe(false)
  })

  it('does not unarchive when a rescan or a lineage rotation rewrites instanceId', () => {
    const discovered = mergeWorktreeMetaForWrite(meta, {})
    expect(discovered.isArchived).toBe(true)
    const rotated = mergeWorktreeMetaForWrite(meta, { instanceId: 'rotated-parent' })
    expect(rotated.isArchived).toBe(true)
    expect(rotated.instanceId).toBe('rotated-parent')
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

    const imported = scannedRow(meta)
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
    expect(stampWorkspaceArchive([scannedRow(meta)])[0]?.isArchived).toBe(false)
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
    const unarchivedScan = scannedRow({ ...archivedMeta(), isArchived: false })
    expect(stampWorkspaceArchive([unarchivedScan])[0]?.isArchived).toBe(true)
  })

  it('leaves another host archived', async () => {
    const other = archivedMeta('other-instance')
    await reactivateRegisteredArchivedWorktreeMeta({
      worktreeId: ID,
      executionHostId: 'local'
    })
    expect(meta.isArchived).toBe(false)
    expect(other.isArchived).toBe(true)
  })

  it('marks a provisioned-root checkout active even when the path was archived', () => {
    const built = buildProvisionedRootMeta(
      { getSettings: () => ({ workspaceDir: '/srv/wt', nestWorkspaces: false }) },
      {
        id: 'repo-1',
        path: '/srv/wt/project',
        displayName: 'demo-hide',
        badgeColor: '#000',
        addedAt: 0
      },
      { name: 'recreate-g' },
      { branchName: 'recreate-g', now: 1, source: 'desktop' }
    )
    expect(built.isArchived).toBe(false)
    expect(built.instanceId).toEqual(expect.any(String))
  })
})
