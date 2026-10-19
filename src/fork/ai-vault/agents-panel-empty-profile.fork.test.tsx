// @vitest-environment happy-dom
// A fresh profile opening the right sidebar's Agents tab: the fork's index status in the panel's
// below-header slot used to select a new host array on every store read, and zustand's
// useSyncExternalStore re-rendered without end (React #185, "Maximum update depth exceeded").
import { act, cleanup, render, screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { registerForkModules } from '../register'
import { registerForkRendererModules } from '../register-renderer'
import { AiVaultIndexStatus } from './index-status'
import { toSshExecutionHostId } from '../../shared/execution-host'
import { unavailableSessionSearchStatus } from '../../shared/ai-vault-search-client'
import type { AiVaultSearchStatus } from '../../shared/ai-vault-search-types'
import { SESSION_SEARCH_SETTLED_POLL_MS } from '../../renderer/src/components/settings/session-history-status-copy'

// No agent sessions at all, as in a profile that never ran one.
vi.mock('../../renderer/src/components/right-sidebar/ai-vault-session-refresh', () => ({
  useAiVaultSessionRefresh: () => ({
    error: null,
    loading: false,
    refresh: vi.fn(),
    scanResult: null,
    sessions: [],
    loadedSessionLimit: null
  })
}))
// The panel's delete action needs the app's confirmation dialog provider.
vi.mock('../../renderer/src/components/right-sidebar/ai-vault-session-delete-action', () => ({
  useAiVaultSessionDeleteAction: () => vi.fn()
}))

let caught: unknown
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(error: unknown): void {
    caught = error
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

beforeAll(() => {
  registerForkModules()
  registerForkRendererModules()
})

beforeEach(() => {
  caught = undefined
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      aiVault: { searchSessions: vi.fn(), searchStatus: vi.fn(async () => null) },
      ui: { writeClipboardText: vi.fn() }
    }
  })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

it('opens the Agents panel of an empty profile without an update loop', async () => {
  const { default: AiVaultPanel } =
    await import('../../renderer/src/components/right-sidebar/AiVaultPanel')
  render(
    <Boundary>
      <AiVaultPanel />
    </Boundary>
  )
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(caught).toBeUndefined()
  // The fork's index status rendered in the slot, so the check above covered it.
  expect(screen.getByRole('button', { name: 'Index status' })).toBeTruthy()
})

function searchStatus(enabled: boolean): AiVaultSearchStatus {
  return {
    ...unavailableSessionSearchStatus(),
    enabled,
    filesIndexed: 3,
    lastReconcileAt: 1,
    lastSweepCompletedAt: 1
  }
}

function renderIndexStatus(): void {
  render(
    <Boundary>
      <AiVaultIndexStatus />
    </Boundary>
  )
}

// Fake hosts only. The settings page lists this computer and paired Orca servers; the index
// status lists the same, plus an SSH target only once it is connected and reports search on.
it('hides SSH targets that are not connected and stays collapsed', async () => {
  useAppStore.setState({
    sshTargetLabels: new Map([
      ['target-1', 'Never connected box'],
      ['target-2', 'Dropped box']
    ]),
    sshConnectionStates: new Map([['target-2', { status: 'disconnected' }]]) as never
  })
  renderIndexStatus()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(caught).toBeUndefined()
  expect(screen.queryByText('Never connected box')).toBeNull()
  expect(screen.queryByText('Dropped box')).toBeNull()
  expect(screen.queryByText('Offline · index status unknown')).toBeNull()
  // No row asked for attention, so the section did not open by itself.
  expect(screen.getByRole('button', { name: 'Index status' }).getAttribute('aria-expanded')).toBe(
    'false'
  )
  expect(window.api.aiVault.searchStatus).not.toHaveBeenCalledWith(toSshExecutionHostId('target-1'))
})

it('shows a connected SSH target only while it reports search on', async () => {
  const statuses = new Map<string, AiVaultSearchStatus>([
    [toSshExecutionHostId('target-on'), searchStatus(true)],
    [toSshExecutionHostId('target-off'), searchStatus(false)]
  ])
  window.api.aiVault.searchStatus = vi.fn(
    async (hostId?: string) => statuses.get(hostId ?? '') ?? searchStatus(false)
  )
  useAppStore.setState({
    sshTargetLabels: new Map([
      ['target-on', 'Search box'],
      ['target-off', 'Search off box']
    ]),
    sshConnectionStates: new Map([
      ['target-on', { status: 'connected' }],
      ['target-off', { status: 'connected' }]
    ]) as never
  })
  renderIndexStatus()
  expect(await screen.findByText('Search box')).toBeTruthy()
  expect(window.api.aiVault.searchStatus).toHaveBeenCalledWith(toSshExecutionHostId('target-off'))
  expect(screen.queryByText('Search off box')).toBeNull()
  act(() => {
    useAppStore.setState({
      sshConnectionStates: new Map([
        ['target-on', { status: 'disconnected' }],
        ['target-off', { status: 'connected' }]
      ]) as never
    })
  })
  expect(screen.queryByText('Search box')).toBeNull()
})

it('keeps a connected SSH target that reported search on when a later read fails', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let fail = false
    const read = vi.fn(async () => {
      if (fail) {
        throw new Error('read failed')
      }
      return searchStatus(true)
    })
    window.api.aiVault.searchStatus = read
    useAppStore.setState({
      sshTargetLabels: new Map([['target-on', 'Search box']]),
      sshConnectionStates: new Map([['target-on', { status: 'connected' }]]) as never
    })
    renderIndexStatus()
    expect(await screen.findByText('Search box')).toBeTruthy()
    fail = true
    const reads = read.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_SEARCH_SETTLED_POLL_MS + 10)
    })
    expect(read.mock.calls.length).toBeGreaterThan(reads)
    expect(screen.getByText('Search box')).toBeTruthy()
    expect(screen.getByText('Could not check status. Retrying…')).toBeTruthy()
  } finally {
    vi.useRealTimers()
  }
})

it('lists the paired Orca servers the settings page lists, not WSL hosts', () => {
  useAppStore.setState({
    runtimeEnvironments: [
      { id: 'env-1', name: 'Paired server' },
      { id: 'env-2', name: 'Recipe VM', source: 'ephemeral-vm' },
      { id: 'env-3', name: 'WSL distro', orcadDeployment: { kind: 'wsl' } }
    ] as never
  })
  renderIndexStatus()
  expect(caught).toBeUndefined()
  expect(screen.getByText('Paired server')).toBeTruthy()
  expect(screen.queryByText('Recipe VM')).toBeNull()
  expect(screen.queryByText('WSL distro')).toBeNull()
})
