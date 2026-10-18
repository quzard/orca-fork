// A drop into a group that holds rows it does not show (hide default branch).
import { describe, expect, it } from 'vitest'
import { draw, dropAndRedraw, keyOf, shownIn, wt } from './group-drop-display.test-fixture'

describe('a drop into a group with rows it does not show', () => {
  it('writes only the moved row for a drop after the last shown row', () => {
    // m (the default branch, hidden) sorts first; x and y are shown.
    const rows = [
      wt('moved', { manualOrder: 100 }),
      wt('m', { sidebarGroupId: 'g1', manualOrder: 900, isMainWorktree: true }),
      wt('x', { sidebarGroupId: 'g1', manualOrder: 800 }),
      wt('y', { sidebarGroupId: 'g1', manualOrder: 700 })
    ]
    const hiddenIds = new Set(['m'])
    expect(shownIn(draw({ rows, hiddenIds }), keyOf('g1'))).toEqual(['x', 'y'])
    const result = dropAndRedraw({ rows, hiddenIds }, 'moved', 'g1', 2)
    expect(result.shown).toEqual(['x', 'y', 'moved'])
    expect(result.written).toEqual(['moved'])
  })

  it('keeps a hidden row in its place when it sorts after the shown ones', () => {
    const rows = [
      wt('moved', { manualOrder: 100 }),
      wt('x', { sidebarGroupId: 'g1', manualOrder: 800 }),
      wt('y', { sidebarGroupId: 'g1', manualOrder: 700 }),
      wt('m', { sidebarGroupId: 'g1', manualOrder: 600, isMainWorktree: true })
    ]
    const hiddenIds = new Set(['m'])
    const result = dropAndRedraw({ rows, hiddenIds }, 'moved', 'g1', 2)
    expect(result.shown).toEqual(['x', 'y', 'moved'])
    expect(result.written).toEqual(['moved'])
    // Shown again, m is still after y; the moved row went between y and m.
    const all = dropAndRedraw({ rows }, 'moved', 'g1', 2)
    expect(all.shown).toEqual(['x', 'y', 'moved', 'm'])
  })
})
