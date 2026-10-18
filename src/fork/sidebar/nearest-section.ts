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

/**
 * The between-row fallback, limited to the group and ungrouped lists: a release whose closest row
 * above or below (within reach) is not a group row, such as a pinned row or header, is not a group
 * drop. Without that, a release just past the pinned area could land in the next group.
 */
export function nearestGroupSectionKey(
  rects: readonly SectionRect[],
  pointerY: number,
  isGroupKey: (key: string) => boolean,
  maxDistance = NEAREST_SECTION_MAX_DISTANCE
): string | null {
  const inReach = rects.filter(
    (rect) => rect.top - pointerY <= maxDistance && pointerY - rect.bottom <= maxDistance
  )
  const above = inReach
    .filter((rect) => rect.bottom <= pointerY)
    .reduce<SectionRect | null>(
      (best, rect) => (!best || rect.bottom > best.bottom ? rect : best),
      null
    )
  const below = inReach
    .filter((rect) => rect.top >= pointerY)
    .reduce<SectionRect | null>((best, rect) => (!best || rect.top < best.top ? rect : best), null)
  if ((above && !isGroupKey(above.key)) || (below && !isGroupKey(below.key))) {
    return null
  }
  const key = nearestSectionKey(rects, pointerY, maxDistance)
  return key !== null && isGroupKey(key) ? key : null
}

/**
 * True when the element under the pointer is empty list space: the scroll container itself or the
 * element that holds the rows. Anything else there (a banner, a button, a placeholder) is not a gap
 * between rows, so the nearest-row fallback must not claim it.
 */
export function isBetweenRowsHit(
  hit: Element | null | undefined,
  container: Element,
  rowParents: ReadonlySet<Element | null>
): boolean {
  return !!hit && (hit === container || rowParents.has(hit))
}
