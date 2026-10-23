// @vitest-environment happy-dom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY } from '../../shared/fork-hooks/git-workspace-capability'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import {
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
  SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID,
  SOURCE_CONTROL_SCOPE_STORAGE_KEY,
  SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID,
  SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID
} from '../git-workspace/constants'
import { ForkSourceControlScope } from './scope-panel'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  supports: vi.fn()
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: mocks.supports
}))

vi.mock('@/lib/workspace-file-open', () => ({
  openWorkspaceFile: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => ({}), { getState: () => ({}) })
}))

function model(target: RuntimeClientTarget, rightSidebarTab = 'source-control') {
  return {
    activeWorktree: { id: 'wt-1' },
    worktreePath: '/ws',
    rightSidebarTab,
    activeRepoTarget: target
  }
}

describe('source control scope switch', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    mocks.callRuntimeRpc.mockReset()
    mocks.callRuntimeRpc.mockResolvedValue({ repositories: [], truncated: false, timedOut: false })
    mocks.supports.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(node: ReactElement): Promise<void> {
    await act(async () => {
      root.render(node)
    })
  }

  it('switches to workspace repos and asks the host', async () => {
    await render(
      <ForkSourceControlScope
        upstream={<div data-testid="upstream" />}
        model={model({ kind: 'local' })}
      />
    )
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
    expect(mocks.supports).not.toHaveBeenCalled()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
    const button = container.querySelector(
      `[data-testid="${SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID}"]`
    ) as HTMLButtonElement
    await act(async () => {
      button.click()
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
  })

  it('does not poll while the panel tab is hidden', async () => {
    await render(
      <ForkSourceControlScope
        upstream={<div data-testid="upstream" />}
        model={model({ kind: 'local' }, 'files')}
      />
    )
    const button = container.querySelector(
      `[data-testid="${SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID}"]`
    ) as HTMLButtonElement
    await act(async () => {
      button.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('asks the SSH host Orca when that environment has the capability', async () => {
    mocks.supports.mockResolvedValue(true)
    await render(
      <ForkSourceControlScope
        upstream={<div data-testid="upstream" />}
        model={model({ kind: 'environment', environmentId: 'env-ssh' })}
      />
    )
    const button = container.querySelector(
      `[data-testid="${SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID}"]`
    ) as HTMLButtonElement
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    await act(async () => {
      button.click()
    })
    await vi.waitFor(() => expect(mocks.callRuntimeRpc).toHaveBeenCalled())
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-ssh' },
      FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
      expect.objectContaining({ worktree: 'id:wt-1', refresh: false }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('greys out a desktop SSH repo and sends nothing', async () => {
    await render(
      <ForkSourceControlScope
        upstream={<div data-testid="upstream" />}
        model={{
          ...model({ kind: 'local' }),
          activeRepoExecutionHostId: 'ssh:box',
          activeConnectionId: 'box'
        }}
      />
    )
    const workspace = container.querySelector(
      `[data-testid="${SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID}"]`
    ) as HTMLButtonElement
    expect(workspace.disabled).toBe(true)
    expect(
      container.querySelector(`[data-testid="${SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID}"]`)
        ?.textContent
    ).toContain('SSH')
    await act(async () => {
      workspace.click()
    })
    expect(mocks.supports).not.toHaveBeenCalled()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
  })

  it('greys out the switch and sends nothing when the host lacks the capability', async () => {
    mocks.supports.mockResolvedValue(false)
    localStorage.setItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY, JSON.stringify({ 'wt-1': 'workspace' }))
    await render(
      <ForkSourceControlScope
        upstream={<div data-testid="upstream" />}
        model={model({ kind: 'environment', environmentId: 'env-1' })}
      />
    )
    await vi.waitFor(() =>
      expect(mocks.supports).toHaveBeenCalledWith(
        'env-1',
        FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY
      )
    )
    await vi.waitFor(() =>
      expect(
        container.querySelector(`[data-testid="${SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID}"]`)
      ).not.toBeNull()
    )
    const current = container.querySelector(
      `[data-testid="${SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID}"]`
    ) as HTMLButtonElement
    const workspace = container.querySelector(
      `[data-testid="${SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID}"]`
    ) as HTMLButtonElement
    expect(current.disabled).toBe(true)
    expect(workspace.disabled).toBe(true)
    expect(current.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-testid="upstream"]')).not.toBeNull()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })
})
