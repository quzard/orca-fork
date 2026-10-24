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

  // 登记了钩子时走 await finish，没登记时直接 return finish。两条都要收到项目组 id。
  it('passes the imported project group to finish when a hook is registered', async () => {
    const received: (string | undefined)[] = []
    registerPostImportHook(() => {})
    const wrapped = withForkPostImportHandoff(
      async (_repoId, _source, _executionHostId, outcome) => {
        received.push(outcome?.importedProjectGroupId)
      }
    )
    await wrapped('repo-1', 'add', 'local', { importedProjectGroupId: 'g1' })
    expect(received).toEqual(['g1'])
  })

  it('passes the imported project group to finish when no hook is registered', async () => {
    const received: (string | undefined)[] = []
    const wrapped = withForkPostImportHandoff(
      async (_repoId, _source, _executionHostId, outcome) => {
        received.push(outcome?.importedProjectGroupId)
      }
    )
    await wrapped('repo-1', 'add', 'local', { importedProjectGroupId: 'g1' })
    expect(received).toEqual(['g1'])
  })
})
