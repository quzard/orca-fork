import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import { persistWorktreeMeta } from '../../renderer/src/store/slices/worktrees/metadata/worktree-meta-persist'
import {
  isSidebarFieldsNotAppliedError,
  SIDEBAR_FIELDS_NOT_APPLIED_CODE,
  SidebarFieldsNotAppliedError,
  sidebarFieldsErrorCode
} from './sidebar-fields-applied'

const mocks = vi.hoisted(() => ({ callRuntimeRpc: vi.fn() }))

vi.mock('../../renderer/src/runtime/runtime-rpc-client', () => ({
  assertRuntimeEnvironmentCapability: vi.fn(async () => undefined),
  callRuntimeRpc: mocks.callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: vi.fn(async () => true)
}))

const target: RuntimeClientTarget = { kind: 'environment', environmentId: 'env-1' }
const id = 'repo::/feature'

describe('worktree.set on a host that strips the sidebar group fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails a group move the host answered without', async () => {
    // An older host: sidebarGroupId and clearFields are stripped, manualOrder applies.
    mocks.callRuntimeRpc.mockResolvedValue({ worktree: { manualOrder: 7 } })
    await expect(
      persistWorktreeMeta(target, id, { sidebarGroupId: 'g1', manualOrder: 7 })
    ).rejects.toMatchObject({ code: SIDEBAR_FIELDS_NOT_APPLIED_CODE })
  })

  it('fails a clear the host ignored', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ worktree: { sidebarGroupId: 'g1', manualOrder: 3 } })
    await expect(
      persistWorktreeMeta(target, id, { sidebarGroupId: undefined, manualOrder: undefined })
    ).rejects.toBeInstanceOf(SidebarFieldsNotAppliedError)
    expect(mocks.callRuntimeRpc.mock.lastCall?.[2]).toMatchObject({
      clearFields: ['sidebarGroupId', 'manualOrder']
    })
  })

  it('accepts a host that applied the group and the clear', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ worktree: { sidebarGroupId: null } })
    await expect(
      persistWorktreeMeta(target, id, { sidebarGroupId: null, manualOrder: undefined })
    ).resolves.toBeUndefined()
  })

  it('leaves every other write unchecked, even without a reply', async () => {
    mocks.callRuntimeRpc.mockResolvedValue(undefined)
    await expect(persistWorktreeMeta(target, id, { isPinned: true })).resolves.toBeUndefined()
    await expect(persistWorktreeMeta(target, id, { manualOrder: 4 })).resolves.toBeUndefined()
  })

  it('matches by code, never by the translated message', () => {
    const error = new SidebarFieldsNotAppliedError()
    expect(isSidebarFieldsNotAppliedError(error)).toBe(true)
    expect(isSidebarFieldsNotAppliedError(new Error(error.message))).toBe(false)
    expect(sidebarFieldsErrorCode(new Error(error.message))).toStrictEqual({})
  })

  it('still matches as a wrapped cause or as the store result', () => {
    // Renderer only: the error is thrown on the worktree.set reply and never crosses IPC.
    const error = new SidebarFieldsNotAppliedError()
    expect(isSidebarFieldsNotAppliedError(new Error('drop failed', { cause: error }))).toBe(true)
    // updateWorktreeMeta keeps only plain fields on its failure result.
    expect(isSidebarFieldsNotAppliedError({ message: 'x', code: error.code })).toBe(true)
    expect(isSidebarFieldsNotAppliedError({ ok: false, error: 'x', code: error.code })).toBe(true)
    expect(sidebarFieldsErrorCode(error)).toStrictEqual({ code: SIDEBAR_FIELDS_NOT_APPLIED_CODE })
  })
})
