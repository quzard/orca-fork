/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBetweenRowsHit, nearestGroupSectionKey } from './nearest-section'
import { elementGroupKey } from './workspace-group-drop'
import {
  PINNED_SECTION_KEY,
  WORKSPACE_SIDEBAR_GROUP_ATTRIBUTE,
  hostDirectorySectionKey,
  parseHostDirectorySectionKey
} from './section-keys'

const group = hostDirectorySectionKey('local', 'g1')
const loose = hostDirectorySectionKey('local', null)
const isGroupKey = (key: string): boolean => parseHostDirectorySectionKey(key) !== null

describe('nearestGroupSectionKey', () => {
  it('keeps the gap between group rows and the ungrouped list', () => {
    const rows = [
      { top: 0, bottom: 40, key: group },
      { top: 46, bottom: 86, key: loose }
    ]
    expect(nearestGroupSectionKey(rows, 41, isGroupKey)).toBe(group)
    expect(nearestGroupSectionKey(rows, 45, isGroupKey)).toBe(loose)
  })

  it('does not reach from the pinned area into the next group', () => {
    const rows = [
      { top: 0, bottom: 40, key: PINNED_SECTION_KEY },
      { top: 46, bottom: 86, key: group }
    ]
    // Closer to the group row, but the row just above is pinned: not a group drop.
    expect(nearestGroupSectionKey(rows, 45, isGroupKey)).toBeNull()
    expect(nearestGroupSectionKey(rows, 41, isGroupKey)).toBeNull()
  })

  it('does not reach from a group into a pinned row below it', () => {
    const rows = [
      { top: 0, bottom: 40, key: group },
      { top: 46, bottom: 86, key: PINNED_SECTION_KEY }
    ]
    expect(nearestGroupSectionKey(rows, 41, isGroupKey)).toBeNull()
  })

  it('ignores a pinned row out of reach', () => {
    const rows = [
      { top: 0, bottom: 40, key: PINNED_SECTION_KEY },
      { top: 100, bottom: 140, key: group },
      { top: 146, bottom: 186, key: group }
    ]
    expect(nearestGroupSectionKey(rows, 143, isGroupKey)).toBe(group)
  })
})

describe('isBetweenRowsHit', () => {
  it('accepts only the container or the row holder', () => {
    const container = document.createElement('div')
    const holder = document.createElement('div')
    const banner = document.createElement('div')
    container.append(holder, banner)
    const parents = new Set<Element | null>([holder])
    expect(isBetweenRowsHit(container, container, parents)).toBe(true)
    expect(isBetweenRowsHit(holder, container, parents)).toBe(true)
    expect(isBetweenRowsHit(banner, container, parents)).toBe(false)
    expect(isBetweenRowsHit(undefined, container, parents)).toBe(false)
  })
})

describe('elementGroupKey', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  function rect(top: number, bottom: number): DOMRect {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hit test reads only these fields.
    return { top, bottom, left: 0, right: 200, width: 200, height: bottom - top } as DOMRect
  }

  function mount(rows: { key: string; top: number; bottom: number }[]): {
    container: HTMLDivElement
    holder: HTMLDivElement
    other: HTMLDivElement
  } {
    const container = document.createElement('div')
    const holder = document.createElement('div')
    const other = document.createElement('div')
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(0, 400))
    for (const row of rows) {
      const element = document.createElement('div')
      element.setAttribute(WORKSPACE_SIDEBAR_GROUP_ATTRIBUTE, row.key)
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(row.top, row.bottom))
      holder.append(element)
    }
    holder.append(other)
    container.append(holder)
    document.body.append(container)
    return { container, holder, other }
  }

  function hitting(elements: Element[]): void {
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => elements
    })
  }

  it('uses the nearest group row for a release in a gap between rows', () => {
    const { container, holder } = mount([
      { key: group, top: 0, bottom: 40 },
      { key: loose, top: 46, bottom: 86 }
    ])
    hitting([holder, container, document.body])
    expect(elementGroupKey(container, 10, 42)).toBe(group)
  })

  it('does not treat a release over a non-row element as a group drop', () => {
    const { container, other } = mount([
      { key: group, top: 0, bottom: 40 },
      { key: loose, top: 46, bottom: 86 }
    ])
    hitting([other, container, document.body])
    expect(elementGroupKey(container, 10, 42)).toBeNull()
  })

  it('does not reach from the pinned rows into a group', () => {
    const { container, holder } = mount([
      { key: PINNED_SECTION_KEY, top: 0, bottom: 40 },
      { key: group, top: 46, bottom: 86 }
    ])
    hitting([holder, container, document.body])
    expect(elementGroupKey(container, 10, 44)).toBeNull()
  })
})
