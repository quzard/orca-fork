import { describe, expect, it } from 'vitest'
import { resolveSkillSourceCommit } from './skill-source-commit'

describe('skill source commit hook', () => {
  it('uses the build commit until a fork registers an upstream base', () => {
    expect(resolveSkillSourceCommit('a'.repeat(40))).toBe('a'.repeat(40))
    expect(resolveSkillSourceCommit(null)).toBeNull()
    expect(resolveSkillSourceCommit('short')).toBeNull()
  })
})
