// 开关缺省为开；只有显式 false 才回到上游。未登记的钩子必须保持上游。
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../shared/constants'
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
    expect(operations.state.settings.terminalFileLinksOpenInCurrentWorkspace).toBe(true)

    updateSettings(operations, { terminalFileLinksOpenInCurrentWorkspace: false })

    expect(operations.state.settings.terminalFileLinksOpenInCurrentWorkspace).toBe(false)
    expect(operations.notifySettingsChanged).not.toHaveBeenCalled()
    updateSettings(
      operations,
      { terminalFileLinksOpenInCurrentWorkspace: true },
      { notifyListeners: true }
    )
    expect(operations.state.settings.terminalFileLinksOpenInCurrentWorkspace).toBe(true)
    expect(operations.notifySettingsChanged).toHaveBeenCalledWith(
      expect.objectContaining({ terminalFileLinksOpenInCurrentWorkspace: true }),
      undefined
    )
  })
})
