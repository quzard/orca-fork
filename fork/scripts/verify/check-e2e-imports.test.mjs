import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  e2eFiles,
  findMissingE2eImports,
  importsForkCode,
  relativeImports
} from './check-e2e-imports.mjs'

const here = import.meta.dirname
const repo = resolve(here, '../../..')
const cli = join(here, 'check-e2e-imports.mjs')

const spec = (path) =>
  [
    "import { test } from '@stablyai/playwright-test'",
    "import { forkShot } from './fork-managed-host-links'",
    `import { toRuntimeExecutionHostId } from '${path}'`,
    ''
  ].join('\n')

// Same layout as after upstream #43047: execution-host.ts lives in a directory of the same name.
// An upstream spec in a subdirectory imports a fork hook; its own non-fork imports are not checked.
const nestedSpec = (hookPath) =>
  ["import '../../../../src/gone'", `import { hook } from '${hookPath}'`, ''].join('\n')

function fixture(specText, hookPath = '../../../../src/shared/fork-hooks/example') {
  const root = mkdtempSync(join(tmpdir(), 'e2e-imports-'))
  mkdirSync(join(root, 'src/shared/execution-host'), { recursive: true })
  writeFileSync(join(root, 'src/shared/execution-host/execution-host.ts'), 'export {}\n')
  mkdirSync(join(root, 'src/shared/fork-hooks'), { recursive: true })
  writeFileSync(join(root, 'src/shared/fork-hooks/example.ts'), 'export const hook = 1\n')
  mkdirSync(join(root, 'tests/e2e/remote/nested'), { recursive: true })
  writeFileSync(join(root, 'tests/e2e/fork-managed-host-links.ts'), 'export const forkShot = 1\n')
  writeFileSync(join(root, 'tests/e2e/fork-example.spec.ts'), specText)
  writeFileSync(join(root, 'tests/e2e/upstream.spec.ts'), "import '../../src/gone'\n")
  writeFileSync(join(root, 'tests/e2e/remote/nested/upstream.spec.ts'), nestedSpec(hookPath))
  writeFileSync(join(root, 'tests/e2e/remote/nested/notes.md'), "import '../../../../src/fork/x'\n")
  return root
}

const runCli = (root) => spawnSync(process.execPath, [cli, root], { encoding: 'utf8' })

test('every e2e file in this repo imports only fork paths that exist', () => {
  const files = e2eFiles(repo)
  assert.ok(files.some((file) => file.startsWith('tests/e2e/fork-')))
  assert.ok(
    files.some((file) => file.split('/').length > 3),
    'subdirectories are scanned'
  )
  assert.deepEqual(findMissingE2eImports(repo), [])
})

test('recognizes imports that reach fork code', () => {
  assert.ok(importsForkCode('../../src/shared/fork-hooks/ai-vault'))
  assert.ok(importsForkCode('../../../src/fork/sidebar/rows'))
  assert.ok(importsForkCode('../fork-managed-host-links'))
  assert.ok(!importsForkCode('./desktop/electron-fixtures/orca-app'))
  assert.ok(!importsForkCode('../../src/shared/workspace/forked-session'))
})

test('finds static, side-effect and dynamic relative imports, not packages', () => {
  const text = [
    "import a from './a'",
    "import './b'",
    "const c = await import('../c.js')",
    "export { d } from './d'",
    "import { e } from 'node:fs'"
  ].join('\n')
  assert.deepEqual(
    relativeImports(text).map((ref) => [ref.specifier, ref.line]),
    [
      ['./a', 1],
      ['./b', 2],
      ['../c.js', 3],
      ['./d', 4]
    ]
  )
})

test('fails on the execution-host path from before upstream moved it', () => {
  const root = fixture(spec('../../src/shared/execution-host'))
  try {
    assert.deepEqual(findMissingE2eImports(root), [
      {
        file: 'tests/e2e/fork-example.spec.ts',
        line: 3,
        specifier: '../../src/shared/execution-host'
      }
    ])
    const result = runCli(root)
    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /tests\/e2e\/fork-example\.spec\.ts:3: \.\.\/\.\.\/src\/shared\/execution-host does not resolve to a file/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('passes on the current execution-host path and skips non-fork imports of upstream files', () => {
  const root = fixture(spec('../../src/shared/execution-host/execution-host'))
  try {
    assert.deepEqual(e2eFiles(root), [
      'tests/e2e/fork-example.spec.ts',
      'tests/e2e/fork-managed-host-links.ts',
      'tests/e2e/remote/nested/upstream.spec.ts',
      'tests/e2e/upstream.spec.ts'
    ])
    assert.deepEqual(findMissingE2eImports(root), [])
    assert.equal(runCli(root).status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fails when a nested upstream e2e file imports a fork hook that moved', () => {
  const root = fixture(
    spec('../../src/shared/execution-host/execution-host'),
    '../../../../src/shared/fork-hooks/gone'
  )
  try {
    assert.deepEqual(findMissingE2eImports(root), [
      {
        file: 'tests/e2e/remote/nested/upstream.spec.ts',
        line: 2,
        specifier: '../../../../src/shared/fork-hooks/gone'
      }
    ])
    const result = runCli(root)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /remote\/nested\/upstream\.spec\.ts:2: .*fork-hooks\/gone/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
