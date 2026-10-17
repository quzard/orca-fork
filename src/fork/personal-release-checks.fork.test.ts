import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { PERSONAL_RELEASE_BRANCH } =
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the cjs module exports this name and the test only reads it.
  require('../../fork/scripts/personal-release-checks.cjs') as {
    PERSONAL_RELEASE_BRANCH: string | undefined
  }

describe('personal release checks', () => {
  it('reads the release branch and leaves orcad template targets to the installer', () => {
    expect(PERSONAL_RELEASE_BRANCH).toBe(process.env.ORCA_FORK_RELEASE_BRANCH?.trim() || undefined)
    const release = readFileSync('fork/scripts/release-personal-orca.mjs', 'utf8')
    expect(release).toContain('dist/mac-arm64/Orca.app')
    expect(release).not.toContain('dist/local-release')
    expect(release).not.toContain('build:orcad-template')
  })
})
