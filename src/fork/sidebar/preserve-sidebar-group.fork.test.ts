import { describe, expect, it } from 'vitest'
import { preserveRegisteredSidebarGroupIds } from '../../shared/fork-hooks/sidebar-group-membership'
import { registerForkModules } from '../register'

registerForkModules()

describe('sidebar group id from an older remote', () => {
  it('keeps a missing id, applies null, and applies a new id', () => {
    const current = [
      { id: 'keep', sidebarGroupId: 'grp-web' },
      { id: 'clear', sidebarGroupId: 'grp-web' },
      { id: 'move', sidebarGroupId: 'grp-web' },
      { id: 'other-host', sidebarGroupId: 'grp-web' }
    ]
    const incoming = [
      { id: 'keep', path: '/srv/wt/project' },
      { id: 'clear', path: '/srv/wt/project', sidebarGroupId: null },
      { id: 'move', path: '/srv/wt/project', sidebarGroupId: 'grp-next' },
      { id: 'other-host', path: '/srv/wt/other' }
    ]
    const next = preserveRegisteredSidebarGroupIds(
      incoming,
      current,
      (row) => row.id !== 'other-host'
    )
    expect(next.find((row) => row.id === 'keep')?.sidebarGroupId).toBe('grp-web')
    expect(next.find((row) => row.id === 'clear')?.sidebarGroupId).toBeNull()
    expect(next.find((row) => row.id === 'move')?.sidebarGroupId).toBe('grp-next')
    expect(next.find((row) => row.id === 'other-host')?.sidebarGroupId).toBeUndefined()
  })
})
