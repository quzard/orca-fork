import { describe, expect, it } from 'vitest'
import { stageGitWorktreeScope } from '../../shared/git/paths/git-stage-worktree-scope'

describe('requirement stage scope', () => {
  it('keeps nested worktree paths out of git add --all and --update', async () => {
    const commands: string[][] = []
    await stageGitWorktreeScope(
      'all',
      async (args) => {
        commands.push(args)
        return { stdout: '' }
      },
      { excludedTreePaths: ['catalog', 'root'] }
    )
    const adds = commands.filter((args) => args[0] === 'add')
    expect(adds.length).toBeGreaterThan(0)
    for (const args of adds) {
      expect(args.join(' ')).toContain(':(exclude,literal)catalog')
      expect(args.join(' ')).toContain(':(exclude,literal)root')
    }
  })
})
