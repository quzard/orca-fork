// fork: 终端里点开的文件是否留在点击时所在的工作区。
// 未登记时保持上游：路径落在另一个工作区里就可以切过去。

import type { ReactNode } from 'react'

export type TerminalFileLinkWorkspaceSettings = {
  /** 缺省（未写入）与 true 都是开。只有 false 才回到上游。 */
  terminalFileLinksOpenInCurrentWorkspace?: boolean
}

export type TerminalFileLinkWorkspaceSearchEntry = {
  title: string
  description?: string
  keywords?: string[]
}

type SettingRender = (
  settings: TerminalFileLinkWorkspaceSettings,
  updateSettings: (updates: { terminalFileLinksOpenInCurrentWorkspace: boolean }) => void
) => ReactNode

let keepsCurrentWorkspace: (() => boolean) | undefined
let renderSetting: SettingRender | undefined
let searchEntries: (() => readonly TerminalFileLinkWorkspaceSearchEntry[]) | undefined

export function registerTerminalFileLinkWorkspace(next: {
  keepsCurrentWorkspace: () => boolean
  renderSetting: SettingRender
  searchEntries: () => readonly TerminalFileLinkWorkspaceSearchEntry[]
}): void {
  keepsCurrentWorkspace = next.keepsCurrentWorkspace
  renderSetting = next.renderSetting
  searchEntries = next.searchEntries
}

/** 登记且当前设置为开时返回 true。未登记时返回 false，调用方保持上游。 */
export function terminalFileLinkKeepsCurrentWorkspace(): boolean {
  return keepsCurrentWorkspace?.() === true
}

export function renderTerminalFileLinkWorkspaceSetting(
  settings: TerminalFileLinkWorkspaceSettings,
  updateSettings: (updates: { terminalFileLinksOpenInCurrentWorkspace: boolean }) => void
): ReactNode {
  return renderSetting?.(settings, updateSettings) ?? null
}

export function terminalFileLinkWorkspaceSearchEntries(): readonly TerminalFileLinkWorkspaceSearchEntry[] {
  return searchEntries?.() ?? []
}
