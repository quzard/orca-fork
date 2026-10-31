import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Bash 3.2 under a non-UTF-8 locale reads the first byte of a CJK character after `$NAME` as part
// of the name, so `"$APP（"` fails with "unbound variable". Fork scripts must write `${NAME}`.
const UNBRACED_BEFORE_NON_ASCII = /\$[A-Za-z_][A-Za-z0-9_]*\P{ASCII}/u

describe('fork shell scripts', () => {
  it('brace every variable that a non-ASCII character follows', () => {
    const scripts = execFileSync('git', ['ls-files', '--', 'fork/*.sh', 'fork/**/*.sh'], {
      encoding: 'utf8'
    })
      .split('\n')
      .filter(Boolean)
    expect(scripts.length).toBeGreaterThan(5)
    const offending = scripts.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          UNBRACED_BEFORE_NON_ASCII.test(line) ? [`${path}:${index + 1}`] : []
        )
    )
    expect(offending).toEqual([])
  })
})
