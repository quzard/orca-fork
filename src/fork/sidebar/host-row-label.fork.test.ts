import { describe, expect, it } from 'vitest'
import { omitRepeatedHostLabel } from './host-row-label'

describe('omitRepeatedHostLabel', () => {
  const item = { type: 'item' as const, hostContextLabel: 'desk' }
  const blank = { type: 'item' as const, hostContextLabel: '' }
  const header = { type: 'header' as const, hostContextLabel: 'desk' }

  it('clears an item label only when a single host header is retained', () => {
    const rows = [header, item, blank]
    expect(omitRepeatedHostLabel(rows, false)).toBe(rows)
    const cleared = omitRepeatedHostLabel(rows, true)
    expect(cleared[0]).toBe(header)
    expect(cleared[1]?.hostContextLabel).toBeUndefined()
    expect(cleared[2]).toBe(blank)
  })
})
