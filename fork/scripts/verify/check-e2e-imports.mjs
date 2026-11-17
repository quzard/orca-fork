#!/usr/bin/env node
// Fails when a fork e2e file imports a relative path that no longer resolves to a file.
// `pnpm typecheck` does not cover tests/e2e, so an upstream move only shows up when Playwright
// cannot load the spec. Checked: every relative `from '...'`, `import '...'` and `import('...')` in
// tests/e2e/fork-*.{ts,tsx,mts,mjs} (fork specs and fork helpers). A directory is not a module.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const E2E_DIR = 'tests/e2e'
const FORK_FILE = /^fork-.*\.(?:ts|tsx|mts|mjs)$/
const SPECIFIER = /(?:\bfrom\s+|\bimport\s+|\bimport\(\s*)["'](\.{1,2}\/[^"'\s]+)["']/g
const SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '/index.ts',
  '/index.tsx'
]

/** Relative specifiers a file imports, with 1-based line numbers, in file order. */
export function relativeImports(text) {
  return [...text.matchAll(SPECIFIER)].map((match) => ({
    specifier: match[1],
    line: text.slice(0, match.index).split('\n').length
  }))
}

const isFile = (path) => existsSync(path) && statSync(path).isFile()

export function resolvesToFile(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier)
  if (SUFFIXES.some((suffix) => isFile(base + suffix))) {
    return true
  }
  // TypeScript lets `./x.js` name `./x.ts`.
  const js = /\.(?:js|mjs|cjs)$/.exec(base)
  return js !== null && ['.ts', '.tsx', '.mts'].some((ext) => isFile(base.slice(0, js.index) + ext))
}

export function forkE2eFiles(root) {
  const dir = join(root, E2E_DIR)
  if (!existsSync(dir)) {
    return []
  }
  return readdirSync(dir)
    .filter((name) => FORK_FILE.test(name))
    .sort()
    .map((name) => `${E2E_DIR}/${name}`)
}

export function findMissingE2eImports(root, files = forkE2eFiles(root)) {
  const missing = []
  for (const file of files) {
    const abs = join(root, file)
    for (const ref of relativeImports(readFileSync(abs, 'utf8'))) {
      if (!resolvesToFile(abs, ref.specifier)) {
        missing.push({ file, ...ref })
      }
    }
  }
  return missing
}

export function reportMissingE2eImports(root) {
  const missing = findMissingE2eImports(root)
  for (const m of missing) {
    console.error(`${m.file}:${m.line}: ${m.specifier} does not resolve to a file`)
  }
  return missing.length
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, '../../..')
  if (reportMissingE2eImports(root) > 0) {
    process.exit(1)
  }
  console.log('e2e imports ok')
}
