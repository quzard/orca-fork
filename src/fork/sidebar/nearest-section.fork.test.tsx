import { describe, expect, it } from 'vitest'
import { NEAREST_SECTION_MAX_DISTANCE, nearestSectionKey } from './nearest-section'
import { WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP } from '../../renderer/src/components/sidebar/worktree-list/viewport/virtual-rows'

// A group's last row, then the ungrouped list, with the sidebar's row gap between them.
const rows = [
  { top: 0, bottom: 40, key: 'group' },
  { top: 46, bottom: 86, key: 'loose' },
  { top: 92, bottom: 132, key: 'loose' }
]

describe('nearestSectionKey', () => {
  it('maps a release in the gap between two sections to the closer row', () => {
    expect(nearestSectionKey(rows, 41)).toBe('group')
    expect(nearestSectionKey(rows, 45)).toBe('loose')
  })

  it('maps a release between two ungrouped rows to the ungrouped list', () => {
    expect(nearestSectionKey(rows, 89)).toBe('loose')
  })

  it('returns the row under the pointer', () => {
    expect(nearestSectionKey(rows, 20)).toBe('group')
  })

  it('ignores a release far from every row', () => {
    expect(nearestSectionKey(rows, 132 + NEAREST_SECTION_MAX_DISTANCE + 1)).toBeNull()
    expect(nearestSectionKey([], 10)).toBeNull()
  })

  it('reaches across a full row gap', () => {
    expect(NEAREST_SECTION_MAX_DISTANCE).toBeGreaterThanOrEqual(WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP)
  })
})
