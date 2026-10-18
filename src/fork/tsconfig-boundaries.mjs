#!/usr/bin/env node
// A fork file must only reach files its TypeScript projects include, otherwise `pnpm tc` fails
// with TS6307 on a Mac while vitest stays green. Convention: fork code that imports the renderer is
// .tsx (the node project includes only src/fork/**/*.ts); main-process-only code lives under
// src/fork/main/, and *.fork.test.ts are node tests, both excluded from the web projects.
// Runs before `pnpm typecheck` and in src/fork/tsconfig-boundaries.fork.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const CONFIG_DIR = join(ROOT, 'config')

export function globToRegExp(glob) {
  let source = ''
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]
    if (glob.startsWith('**/', index)) {
      source += '(?:.*/)?'
      index += 2
    } else if (glob.startsWith('**', index)) {
      source += '.*'
      index += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  // A pattern that names a directory also covers everything under it.
  return new RegExp(`^${source}(?:/.*)?$`)
}

export function readProject(file, name) {
  const load = (path) => JSON.parse(readFileSync(path, 'utf8'))
  let config = load(join(CONFIG_DIR, file))
  let include = config.include
  let exclude = config.exclude
  // include/exclude in a child replace the parent's.
  while ((!include || !exclude) && config.extends?.startsWith('./')) {
    config = load(join(CONFIG_DIR, config.extends))
    include ??= config.include
    exclude ??= config.exclude
  }
  const toRoot = (pattern) => relative(ROOT, resolve(CONFIG_DIR, pattern)).split('\\').join('/')
  return {
    name,
    include: (include ?? []).map((pattern) => globToRegExp(toRoot(pattern))),
    exclude: (exclude ?? []).map((pattern) => globToRegExp(toRoot(pattern))),
    aliases: name !== 'node'
  }
}

function inProject(project, file) {
  if (file.endsWith('.d.ts') && file.startsWith('src/types/')) {
    return true
  }
  return (
    project.include.some((pattern) => pattern.test(file)) &&
    !project.exclude.some((pattern) => pattern.test(file))
  )
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      return listFiles(path)
    }
    return /\.tsx?$/.test(entry) ? [relative(ROOT, path).split('\\').join('/')] : []
  })
}

const IMPORT_PATTERN = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g

function resolveImport(project, file, specifier) {
  let base
  if (specifier.startsWith('.')) {
    base = join(dirname(join(ROOT, file)), specifier)
  } else if (project.aliases && /^@(?:renderer)?\//.test(specifier)) {
    base = join(ROOT, 'src/renderer/src', specifier.replace(/^@(?:renderer)?\//, ''))
  } else {
    return null
  }
  for (const suffix of ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx']) {
    const candidate = base + suffix
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(ROOT, candidate).split('\\').join('/')
    }
  }
  return null
}

/** `from -> to` for every import of an included fork file that the project does not include. */
export function violations(project) {
  const found = []
  for (const file of listFiles(join(ROOT, 'src/fork'))) {
    if (!inProject(project, file)) {
      continue
    }
    const source = readFileSync(join(ROOT, file), 'utf8')
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const target = resolveImport(project, file, match[1])
      if (target && !inProject(project, target)) {
        found.push(`${file} -> ${target}`)
      }
    }
  }
  return found
}

export function readForkProjects() {
  return [
    readProject('tsconfig.node.json', 'node'),
    readProject('tsconfig.web.json', 'web'),
    readProject('tsconfig.tc.web.json', 'tc.web')
  ]
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const failures = readForkProjects().flatMap((project) =>
    violations(project).map((entry) => `${project.name}: ${entry}`)
  )
  if (failures.length > 0) {
    console.error('Fork files import outside their TypeScript project (TS6307 under pnpm tc):')
    for (const failure of failures) {
      console.error(`  ${failure}`)
    }
    process.exit(1)
  }
}
