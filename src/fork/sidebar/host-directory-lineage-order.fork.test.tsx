// Lineage children in the host-directory sidebar sit right under their parent.
import { describe, expect, it } from 'vitest'
import type { WorktreeLineage } from '../../shared/worktree/lineage-types'
import { draw, dropAndRedraw, keyOf, shownIn, wt } from './group-drop-display.test-fixture'

describe('lineage children in the host-directory sidebar', () => {
  const lineage = (child: string, parent: string): WorktreeLineage => ({
    worktreeId: child,
    worktreeInstanceId: `${child}-instance`,
    parentWorktreeId: parent,
    parentWorktreeInstanceId: `${parent}-instance`,
    origin: 'cli',
    capture: { source: 'terminal-context', confidence: 'inferred' },
    createdAt: 1
  })

  it('draws a child right under its parent, not under the row its own key sorts after', () => {
    const rows = [
      wt('a4', { sidebarGroupId: 'g1', manualOrder: 300, instanceId: 'a4-instance' }),
      wt('c1', { sidebarGroupId: 'g1', manualOrder: 200, instanceId: 'c1-instance' }),
      wt('b3', { sidebarGroupId: 'g1', manualOrder: 100, instanceId: 'b3-instance' })
    ]
    const drawn = draw({ rows, lineageById: { b3: lineage('b3', 'a4') } }).flatMap((row) =>
      row.type === 'item' ? [`${row.worktree.id}:${row.depth}`] : []
    )
    expect(drawn).toEqual(['a4:0', 'b3:1', 'c1:0'])
  })

  it('keeps several children in manual order under their parent', () => {
    const rows = [
      wt('p', { sidebarGroupId: 'g1', manualOrder: 900, instanceId: 'p-instance' }),
      wt('q', { sidebarGroupId: 'g1', manualOrder: 500, instanceId: 'q-instance' }),
      wt('k1', { sidebarGroupId: 'g1', manualOrder: 100, instanceId: 'k1-instance' }),
      wt('k2', { sidebarGroupId: 'g1', manualOrder: 700, instanceId: 'k2-instance' })
    ]
    const drawn = draw({
      rows,
      lineageById: { k1: lineage('k1', 'p'), k2: lineage('k2', 'p') }
    }).flatMap((row) => (row.type === 'item' ? [`${row.worktree.id}:${row.depth}`] : []))
    expect(drawn).toEqual(['p:0', 'k2:1', 'k1:1', 'q:0'])
  })

  it('lands a drop where it was released next to a parent and its child', () => {
    const rows = [
      wt('moved', { manualOrder: 50, instanceId: 'moved-instance' }),
      wt('a4', { sidebarGroupId: 'g1', manualOrder: 300, instanceId: 'a4-instance' }),
      wt('c1', { sidebarGroupId: 'g1', manualOrder: 200, instanceId: 'c1-instance' }),
      wt('b3', { sidebarGroupId: 'g1', manualOrder: 100, instanceId: 'b3-instance' })
    ]
    const input = { rows, lineageById: { b3: lineage('b3', 'a4') } }
    expect(shownIn(draw(input), keyOf('g1'))).toEqual(['a4', 'b3', 'c1'])
    // Released between the child b3 and c1.
    expect(dropAndRedraw(input, 'moved', 'g1', 2).shown).toEqual(['a4', 'b3', 'moved', 'c1'])
    // Released between a4 and its child: the child stays under its parent, so the row lands after
    // b3. Ranked only against its neighbours (300 and 100) it would get 200, tie with c1 and sort
    // after it by name; keys that do not explain the shown order make the drop renumber instead.
    expect(dropAndRedraw(input, 'moved', 'g1', 1).shown).toEqual(['a4', 'b3', 'moved', 'c1'])
  })
})
