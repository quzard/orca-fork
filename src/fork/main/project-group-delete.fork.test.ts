import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  closeTestStores,
  testState,
  createStore,
  makeRepo,
  makeTerminalTab
} from '../../main/persistence-test-harness'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { registerKeepFolderWorkspacesOnGroupDeleteInMain } from '../../shared/fork-hooks/project-group-delete'
import { keepFolderWorkspacesOnGroupDelete } from './project-group-delete'

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))
vi.mock('../../main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../main/telemetry/cohort-classifier', () => ({
  getCohortAtEmit: () => ({ nth_repo_added: 2 })
}))

// The main-process half of "Ungroup only": the renderer keeps the folder workspaces in its cascade,
// but the folder list fetched right after the delete comes from this store.
describe('deleting a project group in main', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-fork-group-delete-'))
    registerKeepFolderWorkspacesOnGroupDeleteInMain(keepFolderWorkspacesOnGroupDelete)
  })

  afterEach(async () => {
    await closeTestStores()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('is registered for the desktop and orcad', () => {
    const register = readFileSync('src/fork/main/register-main.ts', 'utf8')
    expect(register).toMatch(
      /function registerForkMainModules[^}]*registerKeepFolderWorkspacesOnGroupDeleteInMain\(keepFolderWorkspacesOnGroupDelete\)/
    )
  })

  it('ungroups its folder workspaces instead of deleting them, across a restart', async () => {
    const store = await createStore()
    const throwaway = store.createProjectGroup({
      name: 'throwaway',
      parentPath: '/remote/throwaway',
      createdFrom: 'folder-scan',
      connectionId: 'target-1'
    })
    const child = store.createProjectGroup({
      name: 'nested',
      parentPath: '/remote/throwaway/nested',
      createdFrom: 'folder-scan',
      parentGroupId: throwaway.id
    })
    const other = store.createProjectGroup({
      name: 'dirC',
      parentPath: '/home/dirC',
      createdFrom: 'folder-scan'
    })
    const owned = store.createFolderWorkspace({ projectGroupId: throwaway.id, name: 'tfolder' })
    const nested = store.createFolderWorkspace({ projectGroupId: child.id, name: 'nested' })
    // Owned by a group that stays, shown in the deleted one.
    const shown = store.createFolderWorkspace({ projectGroupId: other.id, name: 'shown' })
    store.updateFolderWorkspace(shown.id, { sidebarGroupId: throwaway.id })
    const untouched = store.createFolderWorkspace({ projectGroupId: other.id, name: 'plainfolder' })
    store.addRepo(makeRepo({ id: 'r1', projectGroupId: throwaway.id }))
    const key = folderWorkspaceKey(owned.id)
    store.setWorkspaceSession(
      {
        ...getDefaultWorkspaceSession(),
        tabsByWorktree: { [key]: [makeTerminalTab({ id: 'tfolder-tab', worktreeId: key })] }
      },
      'ssh:target-1'
    )

    expect(store.deleteProjectGroup(throwaway.id)).toBe(true)

    expect(store.getProjectGroups().map((group) => group.id)).toEqual([other.id])
    expect(store.getRepo('r1')?.projectGroupId).toBeNull()
    const byId = new Map(store.getFolderWorkspaces().map((workspace) => [workspace.id, workspace]))
    expect([...byId.keys()].sort()).toEqual([owned.id, nested.id, shown.id, untouched.id].sort())
    expect(byId.get(owned.id)).toMatchObject({
      folderPath: '/remote/throwaway',
      connectionId: 'target-1',
      sidebarGroupId: null
    })
    expect(byId.get(nested.id)?.sidebarGroupId).toBeNull()
    expect(byId.get(shown.id)).toMatchObject({ projectGroupId: other.id, sidebarGroupId: null })
    expect(byId.get(untouched.id)?.sidebarGroupId).toBeUndefined()
    expect(store.getWorkspaceSession('ssh:target-1').tabsByWorktree[key]).toHaveLength(1)

    store.flush()
    const restored = await createStore()
    expect(restored.getFolderWorkspace(owned.id)).toMatchObject({
      name: 'tfolder',
      folderPath: '/remote/throwaway',
      connectionId: 'target-1',
      sidebarGroupId: null
    })
    expect(restored.getFolderWorkspace(nested.id)?.folderPath).toBe('/remote/throwaway/nested')
    expect(restored.getFolderWorkspace(shown.id)?.sidebarGroupId).toBeNull()
  })

  it('still reports a missing group as not deleted and changes nothing', async () => {
    const store = await createStore()
    const group = store.createProjectGroup({
      name: 'dirC',
      parentPath: '/home/dirC',
      createdFrom: 'folder-scan'
    })
    const workspace = store.createFolderWorkspace({ projectGroupId: group.id })
    expect(store.deleteProjectGroup('missing')).toBe(false)
    expect(store.getFolderWorkspace(workspace.id)?.sidebarGroupId).toBeUndefined()
  })
})
