#!/usr/bin/env node
// Fails when an e2e file imports a fork path that no longer resolves to a file.
// `pnpm typecheck` does not cover tests/e2e, so an upstream move only shows up when Playwright
// cannot load the spec. Scans every .ts/.tsx/.mts/.mjs under tests/e2e (any depth). A fork file
// (`fork-*`) has every relative `from '...'`, `import '...'` and `import('...')` checked; any other
// file has only the ones that reach fork code (src/fork/, src/shared/fork-hooks/, a fork-* file).
// A directory is not a module.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const E2E_DIR = 'tests/e2e'
const SOURCE_FILE = /\.(?:ts|tsx|mts|mjs)$/
const FORK_FILE = /^fork-/
const FORK_TARGET = /(?:^|\/)(?:fork|fork-hooks)\/|(?:^|\/)fork-[^/]+$/
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

/** Whether a specifier reaches fork code. */
export const importsForkCode = (specifier) => FORK_TARGET.test(specifier)

function listSources(dir, rel) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') {
      return []
    }
    const path = `${rel}/${entry.name}`
    if (entry.isDirectory()) {
      return listSources(join(dir, entry.name), path)
    }
    return SOURCE_FILE.test(entry.name) ? [path] : []
  })
}

/** Every e2e source file, sorted, relative to the repo root. */
export function e2eFiles(root) {
  const dir = join(root, E2E_DIR)
  return existsSync(dir) ? listSources(dir, E2E_DIR).sort() : []
}

export const isForkE2eFile = (file) => FORK_FILE.test(basename(file))

export function findMissingE2eImports(root, files = e2eFiles(root)) {
  const missing = []
  for (const file of files) {
    const abs = join(root, file)
    const fork = isForkE2eFile(file)
    for (const ref of relativeImports(readFileSync(abs, 'utf8'))) {
      if ((fork || importsForkCode(ref.specifier)) && !resolvesToFile(abs, ref.specifier)) {
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
