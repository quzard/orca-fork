// 开关缺省为开；只有显式 false 才回到上游。未登记的钩子必须保持上游。
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../shared/constants'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  registerTerminalFileLinkWorkspace,
  terminalFileLinkKeepsCurrentWorkspace,
  terminalFileLinkWorkspaceSearchEntries
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import {
  updateSettings,
  type SettingsMutationOperations
} from '../../main/persistence/applying-settings/settings-update'
import { terminalFileLinksOpenInCurrentWorkspace } from './file-link-workspace'
import {
  applyTerminalFileLinkStayStorageEvent,
  forgetClosedTerminalFileLinkStays,
  loadTerminalFileLinkStay,
  nextTerminalFileLinkStayClosures,
  pruneTerminalFileLinkStays,
  rememberTerminalFileLinkStay,
  resetTerminalFileLinkStayCacheForTests,
  saveTerminalFileLinkStay,
  shouldSkipTerminalFileLinkStaySync,
  terminalFileLinkSessionHydrated,
  terminalFileLinkStayKey
} from './file-link-stay'

function storedSetting(value: boolean): Partial<GlobalSettings> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the profile JSON keeps this boolean beside GlobalSettings; the upstream type does not list it.
  return { terminalFileLinksOpenInCurrentWorkspace: value } as Partial<GlobalSettings>
}

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('../../main/telemetry/client', () => ({ track: vi.fn() }))

function makeOperations(): SettingsMutationOperations {
  return {
    state: getDefaultPersistedState(tmpdir()),
    bumpLocalWorktreeScanGeneration: vi.fn(),
    removeRetainedBlob: vi.fn(),
    scheduleSave: vi.fn(),
    notifySettingsChanged: vi.fn()
  }
}

describe('terminalFileLinksOpenInCurrentWorkspace', () => {
  it('stays on when the profile never wrote the key or wrote true', () => {
    expect(terminalFileLinksOpenInCurrentWorkspace(undefined)).toBe(true)
    expect(terminalFileLinksOpenInCurrentWorkspace({})).toBe(true)
    expect(
      terminalFileLinksOpenInCurrentWorkspace({ terminalFileLinksOpenInCurrentWorkspace: true })
    ).toBe(true)
  })

  it('follows upstream only when the profile stored false', () => {
    expect(
      terminalFileLinksOpenInCurrentWorkspace({ terminalFileLinksOpenInCurrentWorkspace: false })
    ).toBe(false)
  })
})

describe('terminal file-link workspace hook', () => {
  it('does nothing until the fork registers, then follows the setting', () => {
    expect(terminalFileLinkKeepsCurrentWorkspace()).toBe(false)
    expect(terminalFileLinkWorkspaceSearchEntries()).toEqual([])
    let on = true
    registerTerminalFileLinkWorkspace({
      keepsCurrentWorkspace: () => on,
      renderSetting: () => null,
      searchEntries: () => [{ title: 'stay' }]
    })
    expect(terminalFileLinkKeepsCurrentWorkspace()).toBe(true)
    expect(terminalFileLinkWorkspaceSearchEntries()).toEqual([{ title: 'stay' }])
    on = false
    expect(terminalFileLinkKeepsCurrentWorkspace()).toBe(false)
  })
})

describe('terminalFileLinksOpenInCurrentWorkspace persistence', () => {
  it('keeps an explicit off through the same settings write as other terminal preferences', () => {
    const operations = makeOperations()
    expect(terminalFileLinksOpenInCurrentWorkspace(operations.state.settings)).toBe(true)

    updateSettings(operations, storedSetting(false))

    expect(terminalFileLinksOpenInCurrentWorkspace(operations.state.settings)).toBe(false)
    expect(operations.notifySettingsChanged).not.toHaveBeenCalled()
    updateSettings(operations, storedSetting(true), { notifyListeners: true })
    expect(terminalFileLinksOpenInCurrentWorkspace(operations.state.settings)).toBe(true)
    expect(operations.notifySettingsChanged).toHaveBeenCalledWith(
      expect.objectContaining({ terminalFileLinksOpenInCurrentWorkspace: true }),
      undefined
    )
  })
})

describe('terminal file-link stay map', () => {
  const storage = new Map<string, string>()
  const home = { worktreeId: 'folder:home', filePath: '/Users/me/x.html' }
  const local = { worktreeId: 'wt-a', filePath: '/repo/a.ts' }

  beforeEach(() => {
    storage.clear()
    resetTerminalFileLinkStayCacheForTests()
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

  it('remembers a stay across a cache reset and drops it when the tab closes', () => {
    saveTerminalFileLinkStay(home.worktreeId, home.filePath)
    saveTerminalFileLinkStay(local.worktreeId, local.filePath)
    resetTerminalFileLinkStayCacheForTests()

    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(true)
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(true)
    expect(loadTerminalFileLinkStay('wt-a', home.filePath)).toBe(false)

    forgetClosedTerminalFileLinkStays([home], [local])
    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(false)
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(true)
  })

  it('does not mark a tab that stayed editable', () => {
    rememberTerminalFileLinkStay(local.worktreeId, local.filePath, { readOnly: undefined })
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(false)
    rememberTerminalFileLinkStay(local.worktreeId, local.filePath, { readOnly: true })
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(true)
  })

  it('prunes marks that are not open once the session has hydrated', () => {
    saveTerminalFileLinkStay(home.worktreeId, home.filePath)
    saveTerminalFileLinkStay(local.worktreeId, local.filePath)
    pruneTerminalFileLinkStays([local])
    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(false)
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(true)
  })

  it('keeps another tab’s write when this tab saves afterwards', () => {
    saveTerminalFileLinkStay(local.worktreeId, local.filePath)
    const key = 'orca.fork.terminal-file-link-stay'
    const foreign = {
      ...JSON.parse(storage.get(key) ?? '{}'),
      [terminalFileLinkStayKey(home.worktreeId, home.filePath)]: true
    }
    storage.set(key, JSON.stringify(foreign))
    saveTerminalFileLinkStay('wt-b', '/repo/b.ts')
    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(true)
    expect(loadTerminalFileLinkStay('wt-b', '/repo/b.ts')).toBe(true)
  })

  it('applies a storage event from another tab before the next read', () => {
    saveTerminalFileLinkStay(local.worktreeId, local.filePath)
    applyTerminalFileLinkStayStorageEvent(
      'orca.fork.terminal-file-link-stay',
      JSON.stringify({ [terminalFileLinkStayKey(home.worktreeId, home.filePath)]: true })
    )
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(false)
    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(true)
  })

  it('skips a store update that did not replace openFiles before hydration finishes', () => {
    expect(shouldSkipTerminalFileLinkStaySync(true, false, false)).toBe(true)
    expect(shouldSkipTerminalFileLinkStaySync(true, true, false)).toBe(false)
    expect(shouldSkipTerminalFileLinkStaySync(true, true, true)).toBe(true)
    expect(shouldSkipTerminalFileLinkStaySync(false, true, true)).toBe(false)
    expect(terminalFileLinkSessionHydrated(true, false)).toBe(false)
    expect(terminalFileLinkSessionHydrated(true, true)).toBe(true)
  })

  it('keeps a mark a snapshot omits until the next openFiles change still lacks it', () => {
    const home = { worktreeId: 'folder:home', filePath: '/Users/me/x.html' }
    const omitted = nextTerminalFileLinkStayClosures([], [home], [])
    expect(omitted.confirmed).toEqual([])
    expect(omitted.pending).toEqual([home])

    const restored = nextTerminalFileLinkStayClosures(omitted.pending, [], [home])
    expect(restored.confirmed).toEqual([])
    expect(restored.pending).toEqual([])

    const closed = nextTerminalFileLinkStayClosures(omitted.pending, [], [])
    expect(closed.confirmed).toEqual([home])
  })
})
