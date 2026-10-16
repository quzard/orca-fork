import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { PERSONAL_ORCAD_TEMPLATE_TARGETS, PERSONAL_RELEASE_BRANCH } =
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the cjs module exports these two names and the test only reads them.
  require('../../fork/scripts/personal-release-checks.cjs') as {
    PERSONAL_ORCAD_TEMPLATE_TARGETS: string
    PERSONAL_RELEASE_BRANCH: string | undefined
  }

describe('personal release checks', () => {
  it('reads the release branch from the environment and keeps the two reachable orcad slots', () => {
    expect(PERSONAL_RELEASE_BRANCH).toBe(process.env.ORCA_FORK_RELEASE_BRANCH?.trim() || undefined)
    expect(PERSONAL_ORCAD_TEMPLATE_TARGETS).toBe('darwin-arm64,linux-x64-glibc')
  })
})
