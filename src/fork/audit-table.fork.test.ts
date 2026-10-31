import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// docs/fork/AUDIT.md comes from `python3 fork/scripts/generate-audit.py`. These checks recompute
// the file set from git themselves, so a generator bug cannot hide a stale table either.
const table = readFileSync('docs/fork/AUDIT.md', 'utf8')
const [mainTable, historyTable = ''] = table.split('\n## ')
const ROW = /^\| `([^`]+)` +\| [^|]+\| (\S+) +\|/gm

function rows(text: string): { path: string; decision: string }[] {
  return [...text.matchAll(ROW)].map((match) => ({ path: match[1], decision: match[2] }))
}

const main = rows(mainTable)
const history = rows(historyTable)

function differingFromBase(): string[] {
  const pin = readFileSync('src/fork/skills-source-commit.ts', 'utf8')
  const base = /FORK_SKILLS_SOURCE_COMMIT = '([0-9a-f]{40})'/.exec(pin)?.[1]
  expect(base, 'skills pin').toBeTruthy()
  return execFileSync('git', ['diff', '--name-only', '--no-renames', base ?? 'missing'], {
    encoding: 'utf8'
  })
    .split('\n')
    .filter(Boolean)
}

describe('fork audit table', () => {
  it('lists exactly the files that differ from the pinned upstream base, upstream files included', () => {
    const paths = main.map((row) => row.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.toSorted()).toEqual(differingFromBase().toSorted())
    expect(main.filter((row) => row.decision !== 'keep')).toEqual([])
  })

  it('lists put-back and deleted files only while they match the base', () => {
    const differing = new Set(differingFromBase())
    expect(history.length).toBeGreaterThan(0)
    expect(
      history.filter(
        (row) => differing.has(row.path) || !['revert-to-upstream', 'delete'].includes(row.decision)
      )
    ).toEqual([])
    expect(history.filter((row) => row.decision === 'delete' && existsSync(row.path))).toEqual([])
  })

  it('summary counts match the rows', () => {
    const counts = new Map<string, number>()
    for (const row of [...main, ...history]) {
      counts.set(row.decision, (counts.get(row.decision) ?? 0) + 1)
    }
    expect(table).toContain(`共 ${main.length + history.length} 行`)
    for (const [decision, count] of counts) {
      expect(table).toContain(`${decision} ${count}`)
    }
  })

  it('is what the generator writes for this tree', () => {
    execFileSync('python3', ['fork/scripts/generate-audit.py', '--check'], { stdio: 'pipe' })
  })
})
