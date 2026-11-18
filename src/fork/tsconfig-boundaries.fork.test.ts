import { describe, expect, it } from 'vitest'
import {
  globToRegExp,
  parseTsconfig,
  readForkProjects,
  violations
} from './tsconfig-boundaries.mjs'

describe('fork files stay inside their TypeScript projects', () => {
  const projects = readForkProjects()

  it.each(projects.map((project) => [project.name, project] as const))(
    '%s: every import of an included fork file is in the project',
    (_name, project) => {
      expect(violations(project)).toEqual([])
    }
  )

  it('catches a fork file that reaches outside its project', () => {
    // Renderer-only fork modules are .tsx, which the node project does not include.
    const node = projects[0]!
    const fake = { ...node, include: [...node.include, globToRegExp('src/fork/**/*.tsx')] }
    expect(violations(fake).some((entry) => entry.includes('src/renderer/'))).toBe(true)
  })

  it('throws on a tsconfig with a syntax error instead of reading part of it', () => {
    const broken = '{\n  // comment\n  "include": ["src/fork/**/*.ts"\n  "exclude": []\n}\n'
    expect(() => parseTsconfig(broken, 'config/tsconfig.broken.json')).toThrow(
      /config\/tsconfig\.broken\.json is not valid JSONC: CommaExpected/
    )
    expect(() => parseTsconfig('{ "include": [', 'config/tsconfig.cut.json')).toThrow(
      /not valid JSONC/
    )
  })

  it('still reads comments and trailing commas', () => {
    const text = '{\n  // upstream comment\n  "include": ["src/**/*.ts",],\n}\n'
    expect(parseTsconfig(text, 'config/tsconfig.ok.json')).toEqual({ include: ['src/**/*.ts'] })
  })
})
