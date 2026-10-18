// @vitest-environment happy-dom
// A fresh profile opening the right sidebar's Agents tab: the fork's index status in the panel's
// below-header slot used to select a new host array on every store read, and zustand's
// useSyncExternalStore re-rendered without end (React #185, "Maximum update depth exceeded").
import { cleanup, render, screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { registerForkModules } from '../register'
import { registerForkRendererModules } from '../register-renderer'
import { AiVaultIndexStatus } from './index-status'

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

it('lists the local host, SSH targets and runtime environments in the index status', () => {
  useAppStore.setState({
    sshTargetLabels: new Map([['target-1', 'Build box']]),
    runtimeEnvironments: [{ id: 'env-1', name: 'Cloud runtime' }] as never
  })
  render(
    <Boundary>
      <AiVaultIndexStatus />
    </Boundary>
  )
  expect(caught).toBeUndefined()
  expect(screen.getByText('Build box')).toBeTruthy()
  expect(screen.getByText('Cloud runtime')).toBeTruthy()
})
