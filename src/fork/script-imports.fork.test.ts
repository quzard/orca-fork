import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

describe('fork release script imports', () => {
  it('fails when an inline node snippet loads a repo file that moved', () => {
    execFileSync(
      process.execPath,
      ['--test', resolve('fork/scripts/verify/check-script-imports.test.mjs')],
      { stdio: 'inherit' }
    )
  })
})
