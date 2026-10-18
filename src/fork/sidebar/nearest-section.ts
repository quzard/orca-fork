// Between-row hit test for cross-group drops. Rows sit WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP apart, so a
// pointer released in that gap is over no row; it belongs to the closest row within reach.

export type SectionRect = { top: number; bottom: number; key: string }

/** Two row gaps: enough to cover the gap and a row's rounded edge, short of a whole row. */
export const NEAREST_SECTION_MAX_DISTANCE = 12

export function nearestSectionKey(
  rects: readonly SectionRect[],
  pointerY: number,
  maxDistance = NEAREST_SECTION_MAX_DISTANCE
): string | null {
  let best: { key: string; distance: number } | null = null
  for (const rect of rects) {
    const distance =
      pointerY < rect.top
        ? rect.top - pointerY
        : pointerY > rect.bottom
          ? pointerY - rect.bottom
          : 0
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { key: rect.key, distance }
    }
  }
  return best?.key ?? null
}
