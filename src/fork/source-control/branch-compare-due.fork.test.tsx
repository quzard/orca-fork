import { describe, expect, it } from 'vitest'
import type { WorkspaceRepositoryStatus } from '../git-workspace/types'
import { branchCompareDue } from './poll-workspace-repos'

function status(overrides: Partial<WorkspaceRepositoryStatus> = {}): WorkspaceRepositoryStatus {
  return {
    repositoryPath: 'libs/core',
    uninitialized: false,
    branch: 'refs/heads/feature',
    head: 'aaa',
    entries: [],
    compareTarget: { ref: 'origin/main', source: 'default' },
    ...overrides
  }
}

describe('branch compare polling', () => {
  it('runs on the first look, a refresh, or a HEAD or target change', () => {
    const current = status()
    expect(branchCompareDue(false, current, undefined)).toBe(true)
    expect(branchCompareDue(false, current, { head: 'aaa', ref: 'origin/main' })).toBe(false)
    expect(branchCompareDue(true, current, { head: 'aaa', ref: 'origin/main' })).toBe(true)
    expect(
      branchCompareDue(false, status({ head: 'bbb' }), { head: 'aaa', ref: 'origin/main' })
    ).toBe(true)
    expect(
      branchCompareDue(
        false,
        status({ compareTarget: { ref: 'origin/develop', source: 'override' } }),
        {
          head: 'aaa',
          ref: 'origin/main'
        }
      )
    ).toBe(true)
    expect(
      branchCompareDue(false, status({ compareTarget: { ref: null, source: 'unset' } }), undefined)
    ).toBe(false)
    expect(branchCompareDue(false, status({ uninitialized: true }), undefined)).toBe(false)
  })
})
