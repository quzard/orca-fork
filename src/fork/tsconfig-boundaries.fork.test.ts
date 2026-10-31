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
})
