import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

describe('upstream aligned base version', () => {
  it('uses the highest stable tag whose mainline is in the pin', () => {
    execFileSync(
      process.execPath,
      ['--test', resolve('fork/scripts/upstream-aligned-version.test.mjs')],
      { stdio: 'inherit' }
    )
  })
})

describe('upstream release published check', () => {
  it('requires a published full GitHub release for the base tag, with an explicit skip', () => {
    execFileSync(
      process.execPath,
      ['--test', resolve('fork/scripts/upstream-release-published.test.mjs')],
      { stdio: 'inherit' }
    )
  })
})
