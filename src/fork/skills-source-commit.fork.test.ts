import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { buildAgentFeatureSkillInstallCommand } from '../shared/agent-feature-install-commands'
import { resolveSkillSourceCommit } from '../shared/fork-hooks/skill-source-commit'
import { FORK_SKILLS_SOURCE_COMMIT } from './skills-source-commit'
import { resolveForkSkillsSourceCommit } from '../../fork/scripts/sync-skills-source-commit.mjs'

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim()
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
