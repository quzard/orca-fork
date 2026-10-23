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

  const pinTestName =
    upstreamRefs.length === 0
      ? 'pins a fork build to the upstream base (skipped: no upstream ref in this clone)'
      : `pins a fork build to the upstream base, never this fork commit (checked against ${upstreamRefs.join(', ')})`

  it.skipIf(upstreamRefs.length === 0)(pinTestName, () => {
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
  })

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
    // 渲染进程用这一份 pin 拼可复制的 npx skills add（含 WSL）。上游 CLI 改为拷贝内置技能文件，不再按提交克隆，主进程和 CLI 闭包都不引用它。
    expect(existsSync('src/fork/skills-source-commit.ts')).toBe(false)
    expect(readFileSync('src/fork/register.ts', 'utf8')).toContain(
      "from '../cli/skills-source-commit'"
    )
    expect(readFileSync('src/fork/main/register-main.ts', 'utf8')).not.toContain(
      'skills-source-commit'
    )
    expect(readFileSync('fork/scripts/verify-packaged-cli-closure.mjs', 'utf8')).not.toContain(
      'skills-source-commit'
    )
    expect(
      readFileSync('src/renderer/src/lib/agent-feature-install-commands.ts', 'utf8')
    ).toContain("import '../../../cli/skills-source-commit'")
    expect(readFileSync('src/cli/index.ts', 'utf8')).not.toContain('../fork/')
    const leaks = cliProductionSources('src/cli').flatMap((path) =>
      runtimeSpecifiers(readFileSync(path, 'utf8'))
        .filter((specifier) => /(?:^|\/)fork(?:\/|$)/.test(specifier))
        .map((specifier) => `${path} -> ${specifier}`)
    )
    expect(leaks).toEqual([])
  })

  it.skipIf(!existsSync('out/cli/index.js'))(
    'resolves the packaged CLI closure without src/fork or the skill pin',
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
