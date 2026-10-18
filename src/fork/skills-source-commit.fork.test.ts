import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAgentFeatureSkillInstallCommand } from '../shared/agent-feature-install-commands'
import { resolveSkillSourceCommit } from '../shared/fork-hooks/skill-source-commit'
import { FORK_SKILLS_SOURCE_COMMIT } from '../cli/skills-source-commit'
import { resolveForkSkillsSourceCommit } from '../../fork/scripts/sync-skills-source-commit.mjs'

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim()
}

function cliProductionSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return cliProductionSources(path)
    }
    if (!entry.isFile() || !path.endsWith('.ts') || path.endsWith('.test.ts')) {
      return []
    }
    return [path]
  })
}

function runtimeSpecifiers(source: string): string[] {
  const code = source.replace(/import\s+type\s+[\s\S]*?\sfrom\s+['"][^'"]+['"]/g, '')
  return [...code.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? ''
  )
}

describe('fork skill source commit', () => {
  it('pins a fork build to the upstream base, never this fork commit', () => {
    const head = git(['rev-parse', 'HEAD'])
    const pin = resolveForkSkillsSourceCommit(head)
    expect(FORK_SKILLS_SOURCE_COMMIT).toBe(pin)
    expect(pin).not.toBe(head)
    expect(() => git(['merge-base', '--is-ancestor', pin, 'fork/base-upstream'])).not.toThrow()
    expect(() => git(['merge-base', '--is-ancestor', pin, 'upstream/main'])).not.toThrow()
    const sourceCommit = resolveSkillSourceCommit(head)
    expect(sourceCommit).toBe(pin)
    const command = buildAgentFeatureSkillInstallCommand(['orca-cli'], {
      sourceCommit: sourceCommit ?? head
    })
    expect(command).toContain(`https://github.com/stablyai/orca/tree/${pin}`)
    expect(command).not.toContain(`/tree/${head}`)
  })

  it('uses upstream main when the fork base ref is missing', () => {
    const upstream = 'a'.repeat(40)
    const run = (args: string[]) => {
      if (args[0] === 'merge-base') {
        throw new Error('missing ref')
      }
      if (args[0] === 'rev-parse' && args[2] === 'upstream/main^{commit}') {
        return upstream
      }
      throw new Error(`unexpected ${args.join(' ')}`)
    }
    expect(resolveForkSkillsSourceCommit('b'.repeat(40), { run, readPin: () => null })).toBe(
      upstream
    )
  })

  it('keeps one pin, inside the CLI tree, and production CLI never imports src/fork', () => {
    // The desktop app and the CLI read the same file; there is no second copy to drift.
    expect(existsSync('src/fork/skills-source-commit.ts')).toBe(false)
    expect(readFileSync('src/fork/register.ts', 'utf8')).toContain(
      "from '../cli/skills-source-commit'"
    )
    expect(readFileSync('src/fork/main/register-main.ts', 'utf8')).toContain(
      "from '../../cli/skills-source-commit'"
    )
    expect(
      readFileSync('src/renderer/src/lib/agent-feature-install-commands.ts', 'utf8')
    ).toContain("import '../../../cli/skills-source-commit'")
    expect(readFileSync('src/cli/handlers/skills.ts', 'utf8')).toContain(
      "from '../skills-source-commit'"
    )
    expect(readFileSync('src/cli/index.ts', 'utf8')).not.toContain('../fork/')
    const leaks = cliProductionSources('src/cli').flatMap((path) =>
      runtimeSpecifiers(readFileSync(path, 'utf8'))
        .filter((specifier) => /(?:^|\/)fork(?:\/|$)/.test(specifier))
        .map((specifier) => `${path} -> ${specifier}`)
    )
    expect(leaks).toEqual([])
  })

  it.skipIf(!existsSync('out/cli/index.js'))(
    'resolves the packaged CLI closure without src/fork',
    () => {
      execFileSync(process.execPath, ['fork/scripts/verify-packaged-cli-closure.mjs'], {
        stdio: 'inherit'
      })
    }
  )

  it('keeps the checked-in pin when no upstream ref is available', () => {
    const pinned = 'c'.repeat(40)
    const run = () => {
      throw new Error('no git')
    }
    expect(resolveForkSkillsSourceCommit('d'.repeat(40), { run, readPin: () => pinned })).toBe(
      pinned
    )
    expect(resolveForkSkillsSourceCommit('d'.repeat(40), { run, readPin: () => pinned })).not.toBe(
      'd'.repeat(40)
    )
  })
})
