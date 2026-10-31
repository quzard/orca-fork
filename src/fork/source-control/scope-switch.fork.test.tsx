// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceControlPanel } from '@/components/right-sidebar/source-control/panel/panel'
import { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY } from '../../shared/fork-hooks/git-workspace-capability'
import { resetSourceControlScopeForTests } from '../../shared/fork-hooks/source-control-scope'
import { resetWorkspaceRepositoryDiffForTests } from '../../shared/fork-hooks/workspace-repository-diff'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import {
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
  SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID,
  SOURCE_CONTROL_SCOPE_STORAGE_KEY,
  SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID,
  SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID
} from '../git-workspace/constants'
import { registerWorkspaceRepositorySourceControl } from './register'

const mocks = vi.hoisted(() => {
  const context: Record<string, unknown> = {}
  return { callRuntimeRpc: vi.fn(), supports: vi.fn(), context }
})

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: mocks.supports
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => ({}), { getState: () => ({}) })
}))

// 上游面板本身原样渲染，只把数据模型和完整面板换成桩，看 panel.tsx 那一行钩子。
vi.mock('@/components/right-sidebar/source-control/panel/use-panel-model', () => ({
  useSourceControlPanelModel: () => ({
    activeRepo: { id: 'repo-1' },
    activeWorktree: { id: mocks.context.activeWorktreeId },
    isFolder: false,
    worktreePath: '/ws'
  })
}))

vi.mock('@/components/right-sidebar/source-control/panel/panel-ready', () => ({
  SourceControlPanelReady: () => <div data-testid="upstream" />
}))

vi.mock('@/components/right-sidebar/source-control/listing/use-worktree-context', () => ({
  useSourceControlWorktreeContext: () => mocks.context
}))

function setContext(target: RuntimeClientTarget, extra: Record<string, unknown> = {}): void {
  mocks.context = {
    activeWorktreeId: 'wt-1',
    worktreePath: '/ws',
    isBranchVisible: true,
    activeRepoTarget: target,
    activeRepoExecutionHostId: target.kind === 'local' ? 'local' : null,
    activeConnectionId: null,
    ...extra
  }
}

function button(testId: string): HTMLButtonElement {
  const node = document.querySelector(`[data-testid="${testId}"]`)
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error(testId)
  }
  return node
}

function hint(): string | null {
  return (
    document.querySelector(`[data-testid="${SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID}"]`)
      ?.textContent ?? null
  )
}

function listedWorktrees(): unknown[] {
  return mocks.callRuntimeRpc.mock.calls
    .filter((call) => call[1] === FORK_GIT_WORKSPACE_REPOSITORIES_METHOD)
    .map((call) => {
      const params: unknown = call[2]
      return params && typeof params === 'object' && 'worktree' in params
        ? params.worktree
        : undefined
    })
}

describe('source control scope switch', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    resetSourceControlScopeForTests()
    resetWorkspaceRepositoryDiffForTests()
    registerWorkspaceRepositorySourceControl()
    mocks.callRuntimeRpc.mockReset()
    mocks.callRuntimeRpc.mockResolvedValue({ repositories: [], truncated: false, timedOut: false })
    mocks.supports.mockReset()
    setContext({ kind: 'local' })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    resetSourceControlScopeForTests()
    resetWorkspaceRepositoryDiffForTests()
  })

  async function render(): Promise<void> {
    await act(async () => {
      root.render(<SourceControlPanel />)
    })
  }

  it('leaves the upstream panel alone when nothing is registered', async () => {
    resetSourceControlScopeForTests()
    await render()
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
    expect(
      container.querySelector(`[data-testid="${SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID}"]`)
    ).toBeNull()
  })

  it('switches to workspace repos and asks the host', async () => {
    await render()
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
    expect(mocks.supports).not.toHaveBeenCalled()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
    await act(async () => {
      button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).click()
    })
    await vi.waitFor(() => expect(mocks.callRuntimeRpc).toHaveBeenCalled())
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
      expect.objectContaining({ worktree: 'id:wt-1', refresh: false }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(localStorage.getItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY)).toContain('"wt-1":"workspace"')
    expect(container.querySelector('[data-testid="upstream"]')).toBeNull()
    // 切回当前仓库就不再记这一条。
    await act(async () => {
      button(SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID).click()
    })
    expect(localStorage.getItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY)).toBeNull()
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
  })

  it('does not poll while the panel is hidden', async () => {
    setContext({ kind: 'local' }, { isBranchVisible: false })
    await render()
    await act(async () => {
      button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('uses the next workspace’s own scope on its first render', async () => {
    localStorage.setItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY, JSON.stringify({ 'wt-1': 'workspace' }))
    await render()
    await vi.waitFor(() => expect(listedWorktrees()).toEqual(['id:wt-1']))
    setContext({ kind: 'local' }, { activeWorktreeId: 'wt-2' })
    await render()
    await act(async () => {
      await Promise.resolve()
    })
    expect(listedWorktrees()).toEqual(['id:wt-1'])
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
  })

  it('asks the SSH host Orca when that environment has the capability', async () => {
    mocks.supports.mockResolvedValue(true)
    setContext({ kind: 'environment', environmentId: 'env-ssh' })
    await render()
    await vi.waitFor(() =>
      expect(button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).disabled).toBe(false)
    )
    await act(async () => {
      button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).click()
    })
    await vi.waitFor(() => expect(mocks.callRuntimeRpc).toHaveBeenCalled())
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-ssh' },
      FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
      expect.objectContaining({ worktree: 'id:wt-1', refresh: false }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it.each([
    ['a legacy SSH row that only has a connection id', null, 'desk'],
    ['a desktop SSH repo', 'ssh:box', 'box']
  ])('greys out %s and sends nothing', async (_name, executionHostId, connectionId) => {
    setContext(
      { kind: 'local' },
      { activeRepoExecutionHostId: executionHostId, activeConnectionId: connectionId }
    )
    await render()
    expect(button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).disabled).toBe(true)
    expect(hint()).toContain('SSH')
    expect(hint()).toContain('Reconnect')
    await act(async () => {
      button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).click()
    })
    expect(mocks.supports).not.toHaveBeenCalled()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
  })

  it('greys out the switch and sends nothing when the host lacks the capability', async () => {
    mocks.supports.mockResolvedValue(false)
    localStorage.setItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY, JSON.stringify({ 'wt-1': 'workspace' }))
    setContext({ kind: 'environment', environmentId: 'env-1' })
    await render()
    await vi.waitFor(() =>
      expect(mocks.supports).toHaveBeenCalledWith(
        'env-1',
        FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY
      )
    )
    await vi.waitFor(() => expect(hint()).toContain('Update the host'))
    expect(button(SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID).disabled).toBe(true)
    expect(button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).disabled).toBe(true)
    expect(button(SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID).getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('says the host is unreachable, then enables the switch once a later probe succeeds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    mocks.supports.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true)
    setContext({ kind: 'environment', environmentId: 'env-1' })
    await render()
    await act(async () => {
      await Promise.resolve()
    })
    expect(hint()).toContain("Can't reach the host")
    expect(button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).disabled).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(mocks.supports).toHaveBeenCalledTimes(2)
    expect(hint()).toBeNull()
    expect(button(SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID).disabled).toBe(false)
  })
})
