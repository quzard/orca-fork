import { describe, expect, it } from 'vitest'
import { applyFolderParentLineage } from './folder-parent-lineage'
describe('folder parent lineage', () => {
  it('records the folder on workspace lineage and clears a git parent', () => {
    const saved: { parentWorkspaceKey: string; parentInstanceId: string | null }[] = []
    let removed = 0
    const store = {
      getFolderWorkspaces: () => [
        { id: 'parent', executionHostId: 'local' as const, connectionId: null }
      ],
      removeWorktreeLineage: () => {
        removed += 1
      },
      setWorkspaceLineage: (lineage: {
        parentWorkspaceKey: string
        parentInstanceId: string | null
      }) => {
        saved.push(lineage)
      }
    }
    expect(
      applyFolderParentLineage({
        selector: 'folder:parent',
        store,
        child: { id: 'repo::/srv/catalog', instanceId: 'child-1', hostId: 'local' },
        target: { hostId: 'local' }
      })
    ).toBe(true)
    expect(removed).toBe(1)
    expect(saved[0]).toMatchObject({
      parentWorkspaceKey: 'folder:parent',
      parentInstanceId: null
    })
    expect(
      applyFolderParentLineage({
        selector: 'id:repo::/srv/other',
        store,
        child: { id: 'repo::/srv/catalog', instanceId: 'child-1', hostId: 'local' },
        target: { hostId: 'local' }
      })
    ).toBe(false)
    expect(() =>
      applyFolderParentLineage({
        selector: 'folder:parent',
        store,
        child: { id: 'repo::/srv/catalog', instanceId: 'child-1', hostId: 'ssh:devbox' },
        target: { hostId: 'ssh:devbox' }
      })
    ).toThrow(/another machine/)
  })
})
