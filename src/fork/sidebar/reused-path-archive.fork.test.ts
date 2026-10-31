import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeWorktree } from '../../main/ipc/worktree-metadata-merge'
import { mergeWorktreeMetaForWrite } from '../../main/persistence/loading-store/worktree-meta-write-normalization'
import {
  registerDurableWorkspaceMetaReactivate,
  reactivateRegisteredArchivedWorktreeMeta
} from '../../shared/fork-hooks/workspace-durable-archive'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import {
  registerReusedPathUnarchive,
  reusedPathUnarchiveMeta
} from '../../shared/fork-hooks/reused-path-unarchive'
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

    registerReusedPathUnarchive()
    meta = mergeWorktreeMetaForWrite(meta, {
      instanceId: 'fresh-instance',
      ...reusedPathUnarchiveMeta(),
      orcaCreationSource: 'desktop'
    })
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

  it('leaves another host archived', async () => {
    const other = archivedMeta('other-instance')
    await reactivateRegisteredArchivedWorktreeMeta({
      worktreeId: ID,
      executionHostId: 'local'
    })
    expect(meta.isArchived).toBe(false)
    expect(other.isArchived).toBe(true)
  })
})
