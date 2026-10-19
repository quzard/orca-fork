// The clear signal for a workspace's own group and manual order, end to end on the host side.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decodeSidebarFieldClears,
  encodeSidebarFieldClears,
  folderSidebarFieldsNotApplied,
  parseClearableSidebarFields
} from '../../shared/fork-hooks/sidebar-field-clear'
import { FolderWorkspaceUpdate } from '../../shared/rpc-contract/folder-workspace-params'
import { WorktreeSet } from '../../shared/rpc-contract/worktree-params'
import { FolderWorkspaceUpdateArgs } from '../../main/ipc/repos/repo-ipc-arg-schemas'
import { updateRuntimeManagedWorktreeMetadata } from '../../main/runtime/runtime-managed-worktree-metadata'
import type { RuntimeStore } from '../../main/runtime/runtime-store-contract'
import type { ResolvedWorktree } from '../../main/runtime/runtime-worktree-path-identity'
import type { Worktree } from '../../shared/worktree/types'
import { closeTestStores, createStore, testState } from '../../main/persistence-test-harness'
import { hostWorktreeTarget } from '../../shared/worktree/host-qualified-identity'

vi.mock('../../main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: vi.fn(),
  sshConfigHostsToTargets: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  }
}))
vi.mock('../../main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../main/telemetry/cohort-classifier', () => ({
  getCohortAtEmit: () => ({ nth_repo_added: 1 })
}))

describe('sidebar field clear wire form', () => {
  it('splits own-undefined fields into clearFields and back', () => {
    const encoded = encodeSidebarFieldClears({
      sidebarGroupId: undefined,
      manualOrder: undefined,
      comment: 'x'
    })
    expect(encoded).toStrictEqual({
      updates: { comment: 'x' },
      clearFields: ['sidebarGroupId', 'manualOrder']
    })
    // survives JSON, which is what the remote wire does
    const wire = JSON.parse(JSON.stringify(encoded)) as typeof encoded
    expect(decodeSidebarFieldClears(wire.updates, wire.clearFields)).toStrictEqual({
      comment: 'x',
      sidebarGroupId: undefined,
      manualOrder: undefined
    })
  })

  it('leaves null (ungroup) and values alone', () => {
    expect(encodeSidebarFieldClears({ sidebarGroupId: null, manualOrder: 3 })).toStrictEqual({
      updates: { sidebarGroupId: null, manualOrder: 3 }
    })
  })

  it('keeps only known names from untyped input', () => {
    expect(parseClearableSidebarFields(['manualOrder', 'comment', 7])).toEqual(['manualOrder'])
    expect(parseClearableSidebarFields('manualOrder')).toBeUndefined()
  })

  it('every schema on the path carries the group and the clear list', () => {
    const folder = {
      folderWorkspaceId: 'f1',
      updates: { sidebarGroupId: 'g1' },
      clearFields: ['manualOrder']
    }
    expect(FolderWorkspaceUpdate.parse(folder)).toEqual(folder)
    expect(FolderWorkspaceUpdateArgs.parse(folder)).toEqual(folder)
    expect(
      WorktreeSet.parse({ worktree: 'id:w1', clearFields: ['sidebarGroupId'] }).clearFields
    ).toEqual(['sidebarGroupId'])
  })

  it('flags a host answer that dropped the group or the clear', () => {
    expect(folderSidebarFieldsNotApplied({ sidebarGroupId: 'g1' }, {})).toBe(true)
    expect(folderSidebarFieldsNotApplied({ sidebarGroupId: 'g1' }, { sidebarGroupId: 'g1' })).toBe(
      false
    )
    expect(folderSidebarFieldsNotApplied({ manualOrder: undefined }, { manualOrder: 4 })).toBe(true)
    expect(folderSidebarFieldsNotApplied({ manualOrder: undefined }, {})).toBe(false)
  })
})

describe('runtime worktree.set clear', () => {
  it('passes cleared fields to the store as own undefined keys', async () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the update only reads id, repoId, hostId and instanceId.
    const worktree = {
      id: 'repo-1::/srv/app',
      repoId: 'repo-1',
      hostId: 'ssh:box',
      path: '/srv/app',
      instanceId: 'i-1'
    } as unknown as ResolvedWorktree
    const setWorktreeMeta = vi.fn()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the update only reads these store members.
    const store = {
      getRepos: () => [],
      setWorktreeMeta
    } as unknown as RuntimeStore
    await updateRuntimeManagedWorktreeMetadata({
      selector: `id:${worktree.id}`,
      updates: { comment: 'c', clearFields: ['sidebarGroupId', 'manualOrder'] },
      store,
      ports: {
        resolveWorktree: vi.fn(async () => worktree),
        validateParent: vi.fn(),
        invalidateResolved: vi.fn(),
        invalidateScan: vi.fn(),
        notifyChanged: vi.fn(),
        showWorktree: vi.fn(async () => worktree as unknown as Worktree)
      }
    })
    // 写入走 setWorktreeMeta(target, updates)。清掉的字段是 updates 里自己的 undefined 键。
    expect(setWorktreeMeta.mock.calls[0]?.[1]).toStrictEqual({
      comment: 'c',
      sidebarGroupId: undefined,
      manualOrder: undefined
    })
  })
})

describe('store: own group and manual order', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-fork-clear-'))
  })
  afterEach(async () => {
    await closeTestStores()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('a worktree meta write clears both fields', async () => {
    const store = await createStore()
    const target = hostWorktreeTarget({ id: 'r1::/srv/wt', hostId: 'local' })
    const written = store.setWorktreeMeta(target, { sidebarGroupId: 'g1', manualOrder: 5 })
    expect(written.sidebarGroupId).toBe('g1')
    expect(written.manualOrder).toBe(5)
    const meta = store.setWorktreeMeta(
      target,
      decodeSidebarFieldClears({}, ['sidebarGroupId', 'manualOrder'])
    )
    expect(meta.sidebarGroupId).toBeUndefined()
    expect(meta.manualOrder).toBeUndefined()
  })

  it('a folder workspace keeps its group across a reload and can clear it', async () => {
    const store = await createStore()
    const group = store.createProjectGroup({
      name: 'P',
      parentPath: '/srv/p',
      createdFrom: 'folder-scan'
    })
    const workspace = store.createFolderWorkspace({ projectGroupId: group.id, name: 'notes' })
    store.updateFolderWorkspace(workspace.id, { sidebarGroupId: null, manualOrder: 7 })
    store.flush()
    const restored = await createStore()
    expect(restored.getFolderWorkspace(workspace.id)).toMatchObject({
      sidebarGroupId: null,
      manualOrder: 7
    })

    const cleared = restored.updateFolderWorkspace(
      workspace.id,
      decodeSidebarFieldClears({}, ['sidebarGroupId', 'manualOrder'])
    )
    expect(cleared && Object.hasOwn(cleared, 'sidebarGroupId')).toBe(false)
    expect(cleared && Object.hasOwn(cleared, 'manualOrder')).toBe(false)
  })
})
