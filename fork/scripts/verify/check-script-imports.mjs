#!/usr/bin/env node
// Fails when a fork release script loads a repo file that is gone. Upstream moves files often;
// the inline node snippets in these shell scripts are not type-checked, so a move only shows up
// when the LaunchAgent run stops. Checked: `from "./src/..."`, `import("./src/...")`,
// `require('./src/...')` and `node [--flags] <config|fork|src>/....mjs` paths, relative to the repo root.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const DEFAULT_SCRIPTS = [
  'fork/scripts/mac-auto-update.sh',
  'fork/scripts/install-mac-release.sh'
]

const PATTERNS = [
  /(?:\bfrom\s+|\bimport\(\s*|\brequire\(\s*)["']\.\/((?:src|config|fork)\/[^"'\s]+)["']/g,
  /\bnode\s+(?:--[\w=.-]+\s+)*((?:src|config|fork)\/[\w./@-]+\.(?:mjs|cjs|js|ts))\b/g
]

/** Repo-relative files a script loads, with 1-based line numbers, in file order. */
export function scriptRepoImports(text) {
  const refs = []
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split('\n').length
      refs.push({ path: match[1], line })
    }
  }
  return refs.sort((a, b) => a.line - b.line || a.path.localeCompare(b.path))
}

export function findMissingScriptImports(root, scripts = DEFAULT_SCRIPTS) {
  const missing = []
  for (const script of scripts) {
    const file = join(root, script)
    if (!existsSync(file)) {
      missing.push({ script, line: 0, path: script })
      continue
    }
    for (const ref of scriptRepoImports(readFileSync(file, 'utf8'))) {
      if (!existsSync(join(root, ref.path))) {
        missing.push({ script, ...ref })
      }
    }
  }
  return missing
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, '../../..')
  const missing = findMissingScriptImports(root)
  for (const m of missing) {
    console.error(`${m.script}:${m.line}: ${m.path} does not exist`)
  }
  if (missing.length > 0) {
    process.exit(1)
  }
  console.log('script imports ok')
}
