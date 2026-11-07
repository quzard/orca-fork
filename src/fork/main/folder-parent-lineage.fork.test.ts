import { describe, expect, it } from 'vitest'
import { applyFolderParentLineage } from './folder-parent-lineage'
import type { WorktreeLineage } from '../../shared/worktree/lineage-types'

describe('folder parent lineage', () => {
  it('records the existing folder workspace id and does not invent an instance', () => {
    const saved: WorktreeLineage[] = []
    const store = {
      getFolderWorkspaces: () => [
        { id: 'parent', executionHostId: 'local' as const, connectionId: null }
      ],
      setWorktreeLineage: (_target: unknown, lineage: WorktreeLineage) => {
        saved.push(lineage)
        return true
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
    expect(saved[0]).toMatchObject({
      parentWorktreeId: 'folder:parent',
      parentWorktreeInstanceId: 'parent',
      worktreeId: 'repo::/srv/catalog',
      worktreeInstanceId: 'child-1'
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
