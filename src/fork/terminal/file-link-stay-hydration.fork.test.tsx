// 启动失败会把 workspaceSessionReady 设上，但 hydrationSucceeded 仍是 false，不能把标记清掉。
import { beforeEach, describe, expect, it, vi } from 'vitest'

type StayFile = { id: string; worktreeId: string; filePath: string }
type StayState = {
  openFiles: StayFile[]
  workspaceSessionReady: boolean
  hydrationSucceeded: boolean
  settings: object
}

const listeners = new Set<(state: StayState) => void>()
let state: StayState

function setState(partial: Partial<StayState>): void {
  state = { ...state, ...partial }
  for (const listener of listeners) {
    listener(state)
  }
}

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => state,
    subscribe: (listener: (next: StayState) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}))

vi.mock('@/components/settings/SearchableSetting', () => ({
  SearchableSetting: () => null
}))

vi.mock('@/components/settings/SettingsFormControls', () => ({
  SettingsSwitchRow: () => null
}))

import { registerTerminalFileLinkWorkspaceSetting } from './file-link-workspace-setting'
import {
  loadTerminalFileLinkStay,
  resetTerminalFileLinkStayCacheForTests,
  saveTerminalFileLinkStay
} from './file-link-stay'

const PATH = '/Users/me/x.html'
const WORKTREE = 'wt-a'

describe('terminal file-link stay hydration', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    resetTerminalFileLinkStayCacheForTests()
    listeners.clear()
    state = {
      openFiles: [],
      workspaceSessionReady: false,
      hydrationSucceeded: false,
      settings: {}
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        }
      }
    })
  })

  it('does not prune when a degraded startup is ready with no files, and waits out a snapshot gap', () => {
    saveTerminalFileLinkStay(WORKTREE, PATH)
    registerTerminalFileLinkWorkspaceSetting()

    setState({
      workspaceSessionReady: true,
      hydrationSucceeded: false,
      openFiles: []
    })
    expect(loadTerminalFileLinkStay(WORKTREE, PATH)).toBe(true)

    const kept = { id: 'owned', worktreeId: WORKTREE, filePath: PATH }
    setState({ hydrationSucceeded: true, openFiles: [kept] })
    expect(loadTerminalFileLinkStay(WORKTREE, PATH)).toBe(true)

    setState({ openFiles: [] })
    expect(loadTerminalFileLinkStay(WORKTREE, PATH)).toBe(true)

    setState({ openFiles: [{ id: 'other', worktreeId: 'wt-b', filePath: '/repo/b.ts' }] })
    expect(loadTerminalFileLinkStay(WORKTREE, PATH)).toBe(false)
  })
})
