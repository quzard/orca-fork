import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('packaging hooks', () => {
  it('keeps static history files out of the Mac signature', () => {
    const hooks: unknown = require('../packaging.cjs')
    const ignore =
      hooks &&
      typeof hooks === 'object' &&
      'extraMacSignIgnore' in hooks &&
      Array.isArray(hooks.extraMacSignIgnore)
        ? hooks.extraMacSignIgnore
        : []
    expect(ignore).toContain('/ai-vault/')
  })
})
