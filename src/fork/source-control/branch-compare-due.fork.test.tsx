import { describe, expect, it } from 'vitest'
import { WORKSPACE_REPOSITORY_BRANCH_COMPARE_INTERVAL_MS } from '../git-workspace/constants'
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

const seen = { head: 'aaa', ref: 'origin/main', baseOid: 'old', at: 10_000 }

describe('branch compare polling', () => {
  it('runs on the first look, a refresh, or a HEAD or target change', () => {
    const current = status()
    expect(branchCompareDue(false, current, undefined, seen.at)).toBe(true)
    expect(branchCompareDue(false, current, seen, seen.at)).toBe(false)
    expect(branchCompareDue(true, current, seen, seen.at)).toBe(true)
    expect(branchCompareDue(false, status({ head: 'bbb' }), seen, seen.at)).toBe(true)
    expect(branchCompareDue(false, status({ baseOid: 'new' }), seen, seen.at)).toBe(true)
    expect(branchCompareDue(false, status({ baseOid: 'old' }), seen, seen.at)).toBe(false)
    expect(
      branchCompareDue(
        false,
        status({ compareTarget: { ref: 'origin/develop', source: 'override' } }),
        seen,
        seen.at
      )
    ).toBe(true)
    expect(
      branchCompareDue(
        false,
        status({ compareTarget: { ref: null, source: 'unset' } }),
        undefined,
        seen.at
      )
    ).toBe(false)
    expect(branchCompareDue(false, status({ uninitialized: true }), undefined, seen.at)).toBe(false)
  })

  it('re-compares after the interval when HEAD and the base ref name stay put', () => {
    const current = status()
    expect(
      branchCompareDue(
        false,
        current,
        seen,
        seen.at + WORKSPACE_REPOSITORY_BRANCH_COMPARE_INTERVAL_MS - 1
      )
    ).toBe(false)
    expect(
      branchCompareDue(
        false,
        current,
        seen,
        seen.at + WORKSPACE_REPOSITORY_BRANCH_COMPARE_INTERVAL_MS
      )
    ).toBe(true)
  })
})
