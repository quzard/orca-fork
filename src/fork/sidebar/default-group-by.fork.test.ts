import { describe, expect, it } from 'vitest'
import { getDefaultUIState } from '../../shared/constants'
import { hydrateSidebarGroupBy } from '../../shared/fork-hooks/sidebar-group-mode'
import { normalizeGroupBy } from '../../main/persistence/applying-settings/ui-selection-normalization'
import { registerForkModules } from '../register'
import { HOST_DIRECTORY_GROUP_BY } from './section-keys'

describe('sidebar default group', () => {
  it('keeps project grouping when no fork mode is registered', () => {
    expect(getDefaultUIState().groupBy).toBe('repo')
    expect(normalizeGroupBy('repo')).toBe('repo')
    expect(hydrateSidebarGroupBy('parent')).toBe('repo')
  })

  it('reads a saved project grouping as host-directory once registered, other modes unchanged', () => {
    registerForkModules()
    expect(normalizeGroupBy('repo')).toBe(HOST_DIRECTORY_GROUP_BY)
    expect(normalizeGroupBy('none')).toBe('none')
    expect(normalizeGroupBy('pr-status')).toBe('pr-status')
    expect(normalizeGroupBy('workspace-status')).toBe('workspace-status')
  })
})
