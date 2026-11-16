import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { findMissingScriptImports, scriptRepoImports } from './check-script-imports.mjs'

const here = import.meta.dirname
const repo = resolve(here, '../../..')
const cli = join(here, 'check-script-imports.mjs')

const pinSnippet = (path) =>
  `#!/usr/bin/env bash\npin="$(node --input-type=module -e '\n    import { NODE_RUNTIME_PIN } from "./${path}"\n')"\n`

function fixture(script) {
  const root = mkdtempSync(join(tmpdir(), 'script-imports-'))
  mkdirSync(join(root, 'src/shared/node-runtime'), { recursive: true })
  writeFileSync(join(root, 'src/shared/node-runtime/node-runtime-pin.ts'), 'export {}\n')
  mkdirSync(join(root, 'fork/scripts'), { recursive: true })
  writeFileSync(join(root, 'fork/scripts/mac-auto-update.sh'), script)
  writeFileSync(join(root, 'fork/scripts/install-mac-release.sh'), '#!/usr/bin/env bash\n')
  return root
}

function runCli(root) {
  return spawnSync(process.execPath, [cli, root], { encoding: 'utf8' })
}

test('the release scripts in this repo load only files that exist', () => {
  assert.deepEqual(findMissingScriptImports(repo), [])
})

test('finds inline imports, requires and node script paths', () => {
  const text = [
    'import x from "./src/a.ts"',
    `node -p "require('./src/b.cjs').x"`,
    'node --disable-warning=X config/scripts/c.mjs --flag',
    'echo src/not-loaded.ts'
  ].join('\n')
  assert.deepEqual(
    scriptRepoImports(text).map((ref) => [ref.path, ref.line]),
    [
      ['src/a.ts', 1],
      ['src/b.cjs', 2],
      ['config/scripts/c.mjs', 3]
    ]
  )
})

test('fails on the node-runtime-pin path from before upstream moved it', () => {
  const root = fixture(pinSnippet('src/shared/node-runtime-pin.ts'))
  try {
    assert.deepEqual(findMissingScriptImports(root), [
      { script: 'fork/scripts/mac-auto-update.sh', line: 3, path: 'src/shared/node-runtime-pin.ts' }
    ])
    const result = runCli(root)
    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /fork\/scripts\/mac-auto-update\.sh:3: src\/shared\/node-runtime-pin\.ts does not exist/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('passes on the current node-runtime-pin path', () => {
  const root = fixture(pinSnippet('src/shared/node-runtime/node-runtime-pin.ts'))
  try {
    assert.deepEqual(findMissingScriptImports(root), [])
    assert.equal(runCli(root).status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reports a release script that is missing', () => {
  const root = fixture(pinSnippet('src/shared/node-runtime/node-runtime-pin.ts'))
  try {
    rmSync(join(root, 'fork/scripts/install-mac-release.sh'))
    assert.equal(runCli(root).status, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
