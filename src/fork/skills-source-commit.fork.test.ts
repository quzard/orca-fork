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

const UPSTREAM_REFS = [
  'fork/base-upstream',
  'origin/fork/base-upstream',
  'upstream/main',
  'origin/upstream/main'
]

function hasRef(ref: string): boolean {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
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
  // The pin is checked against whichever upstream refs this clone has. A clone with none of them
  // (no fork/base-upstream, no upstream/main) cannot say what the base is, so it skips by name.
  const upstreamRefs = UPSTREAM_REFS.filter((ref) => hasRef(ref))

  it.skipIf(upstreamRefs.length === 0)(
    'pins a fork build to the upstream base, never this fork commit (skipped: no upstream ref in this clone)',
    () => {
      const head = git(['rev-parse', 'HEAD'])
      const pin = resolveForkSkillsSourceCommit(head)
      expect(FORK_SKILLS_SOURCE_COMMIT).toBe(pin)
      expect(pin).not.toBe(head)
      // The pin is the base the resolver found from the first ref present, and every ref present
      // contains it: a fork/base-upstream-less Mac uses merge-base with upstream/main, not its tip.
      expect(pin).toBe(git(['merge-base', 'HEAD', upstreamRefs[0]!]))
      for (const ref of upstreamRefs) {
        expect(() => git(['merge-base', '--is-ancestor', pin!, ref])).not.toThrow()
      }
      const sourceCommit = resolveSkillSourceCommit(head)
      expect(sourceCommit).toBe(pin)
      const command = buildAgentFeatureSkillInstallCommand(['orca-cli'], {
        sourceCommit: sourceCommit ?? head
      })
      expect(command).toContain(`https://github.com/stablyai/orca/tree/${pin}`)
      expect(command).not.toContain(`/tree/${head}`)
    }
  )

  it('uses the merge-base with upstream main, not its tip, when the fork base ref is missing', () => {
    const base = 'a'.repeat(40)
    const run = (args: string[]) => {
      if (args[0] === 'merge-base' && args[2]?.includes('fork/base-upstream')) {
        throw new Error('missing ref')
      }
      if (args.join(' ') === 'merge-base HEAD upstream/main') {
        return base
      }
      throw new Error(`unexpected ${args.join(' ')}`)
    }
    expect(resolveForkSkillsSourceCommit('b'.repeat(40), { run, readPin: () => null })).toBe(base)
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
