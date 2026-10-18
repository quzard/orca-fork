import { afterEach, describe, expect, it } from 'vitest'
import {
  registerPostImportHook,
  withForkPostImportHandoff,
  type ForkPostImportDetails
} from '../../shared/fork-hooks/post-import'

describe('post-import handoff wrapper', () => {
  afterEach(() => registerPostImportHook(undefined))

  it('runs the finish alone, returning its own promise, when nothing is registered', async () => {
    const pending = Promise.resolve()
    const finish = async (): Promise<void> => pending
    const wrapped = withForkPostImportHandoff(finish)
    await expect(wrapped('repo-1', 'add')).resolves.toBeUndefined()
  })

  it('runs the handoff after the finish, and also when the finish throws', async () => {
    const calls: string[] = []
    registerPostImportHook((details: ForkPostImportDetails) => {
      calls.push(`${details.phase}:${details.repoId}:${details.source}:${details.executionHostId}`)
    })
    const ok = withForkPostImportHandoff(async (repoId: string) => {
      calls.push(`finish:${repoId}`)
    })
    await ok('repo-1', 'add', 'local')
    expect(calls).toEqual(['finish:repo-1', 'handoff:repo-1:add:local'])

    calls.length = 0
    const failing = withForkPostImportHandoff(async () => {
      throw new Error('handoff failed')
    })
    await expect(failing('repo-2', 'add')).rejects.toThrow('handoff failed')
    expect(calls).toEqual(['handoff:repo-2:add:undefined'])
  })

  it('returns one wrapper per callback so a memoized callback keeps its identity', () => {
    const finish = async (): Promise<void> => {}
    expect(withForkPostImportHandoff(finish)).toBe(withForkPostImportHandoff(finish))
  })
})
