// The checker lives in tsconfig-boundaries.mjs so `pnpm typecheck` can run it before tsc.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { globToRegExp, readForkProjects, violations } from './tsconfig-boundaries.mjs'

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

  it('runs as a CLI before every typecheck', () => {
    execFileSync(process.execPath, ['src/fork/tsconfig-boundaries.mjs'], { stdio: 'pipe' })
    const scripts = (
      JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    ).scripts
    for (const name of ['typecheck', 'typecheck:ci']) {
      expect(scripts[name]).toContain('node src/fork/tsconfig-boundaries.mjs &&')
    }
  })
})
