import { describe, expect, it } from 'vitest'
import { getDefaultUIState } from '../../shared/constants'
import { hydrateSidebarGroupBy } from '../../shared/fork-hooks/sidebar-group-mode'
import { normalizeGroupBy } from '../../main/persistence/applying-settings/ui-selection-normalization'

describe('unregistered sidebar default', () => {
  it('keeps project grouping when no fork mode is registered', () => {
    expect(getDefaultUIState().groupBy).toBe('repo')
    expect(normalizeGroupBy('repo')).toBe('repo')
    expect(hydrateSidebarGroupBy('parent')).toBe('repo')
  })
})
