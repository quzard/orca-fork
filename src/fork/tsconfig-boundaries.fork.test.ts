// A fork file must only reach files its TypeScript projects include. A fork file that imports
// renderer code belongs in the node project's exclude, and one that imports main code belongs in
// the web excludes; otherwise `pnpm tc` fails with TS6307 on a Mac while vitest stays green.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const CONFIG_DIR = join(ROOT, 'config')

type Project = { name: string; include: RegExp[]; exclude: RegExp[]; aliases: boolean }

function globToRegExp(glob: string): RegExp {
  let source = ''
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]!
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

function readProject(file: string, name: string): Project {
  type Config = { extends?: string; include?: string[]; exclude?: string[] }
  const load = (path: string): Config => JSON.parse(readFileSync(path, 'utf8')) as Config
  let config = load(join(CONFIG_DIR, file))
  let include = config.include
  let exclude = config.exclude
  // include/exclude in a child replace the parent's.
  while ((!include || !exclude) && config.extends?.startsWith('./')) {
    config = load(join(CONFIG_DIR, config.extends))
    include ??= config.include
    exclude ??= config.exclude
  }
  const toRoot = (pattern: string) =>
    relative(ROOT, resolve(CONFIG_DIR, pattern)).split('\\').join('/')
  return {
    name,
    include: (include ?? []).map((pattern) => globToRegExp(toRoot(pattern))),
    exclude: (exclude ?? []).map((pattern) => globToRegExp(toRoot(pattern))),
    aliases: name !== 'node'
  }
}

function inProject(project: Project, file: string): boolean {
  if (file.endsWith('.d.ts') && file.startsWith('src/types/')) {
    return true
  }
  return (
    project.include.some((pattern) => pattern.test(file)) &&
    !project.exclude.some((pattern) => pattern.test(file))
  )
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory()
      ? listFiles(path)
      : /\.tsx?$/.test(entry)
        ? [relative(ROOT, path).split('\\').join('/')]
        : []
  })
}

const IMPORT_PATTERN = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g

function resolveImport(project: Project, file: string, specifier: string): string | null {
  let base: string
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

function violations(project: Project): string[] {
  const found: string[] = []
  for (const file of listFiles(join(ROOT, 'src/fork'))) {
    if (!inProject(project, file)) {
      continue
    }
    const source = readFileSync(join(ROOT, file), 'utf8')
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const target = resolveImport(project, file, match[1]!)
      if (target && !inProject(project, target)) {
        found.push(`${file} -> ${target}`)
      }
    }
  }
  return found
}

describe('fork files stay inside their TypeScript projects', () => {
  const projects = [
    readProject('tsconfig.node.json', 'node'),
    readProject('tsconfig.web.json', 'web'),
    readProject('tsconfig.tc.web.json', 'tc.web')
  ]

  it.each(projects.map((project) => [project.name, project]))(
    '%s: every import of an included fork file is in the project',
    (_name, project) => {
      expect(violations(project as Project)).toEqual([])
    }
  )

  it('catches a fork file that reaches outside its project', () => {
    const node = projects[0]!
    const fake = { ...node, exclude: [] }
    expect(violations(fake).some((entry) => entry.includes('src/renderer/'))).toBe(true)
  })
})
