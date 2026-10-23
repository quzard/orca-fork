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
  forgetClosedTerminalFileLinkStays,
  loadTerminalFileLinkStay,
  resetTerminalFileLinkStayCacheForTests,
  saveTerminalFileLinkStay
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

  it('remembers a host read across a cache reset and drops it when the tab closes', () => {
    const hostRead = { worktreeId: 'folder:home', relativePath: 'x.html' }
    saveTerminalFileLinkStay('editor:a', hostRead)
    saveTerminalFileLinkStay('editor:local', null)
    resetTerminalFileLinkStayCacheForTests()

    expect(loadTerminalFileLinkStay('editor:a')).toEqual({ read: hostRead })
    expect(loadTerminalFileLinkStay('editor:local')).toEqual({ read: null })
    expect(loadTerminalFileLinkStay('editor:other')).toBeNull()

    forgetClosedTerminalFileLinkStays(new Set(['editor:a']), new Set(['editor:local']))
    expect(loadTerminalFileLinkStay('editor:a')).toBeNull()
    expect(loadTerminalFileLinkStay('editor:local')).toEqual({ read: null })
  })

  it('leaves a restored mark alone when that id was not open yet', () => {
    saveTerminalFileLinkStay('editor:restored', {
      worktreeId: 'folder:home',
      relativePath: 'x.html'
    })
    forgetClosedTerminalFileLinkStays(new Set(), new Set())
    expect(loadTerminalFileLinkStay('editor:restored')?.read?.relativePath).toBe('x.html')
  })
})
