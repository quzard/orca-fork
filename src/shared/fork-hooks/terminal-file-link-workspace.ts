// fork: 终端或原生对话里点开的文件是否留在点击时所在的工作区。
// 未登记时保持上游：路径落在另一个工作区里就可以切过去。

import type { ReactNode } from 'react'
import type { GlobalSettings } from '../global-settings-types'

export type TerminalFileLinkWorkspaceSearchEntry = {
  title: string
  description?: string
  keywords?: string[]
}

/** 配对运行时上，另一个工作区里的文件要按这个工作区的相对路径向主机读。 */
export type TerminalFileLinkHostRead = {
  worktreeId: string
  relativePath: string
}

/** 有记录才跳过重挂。read 为空表示仍按标签上的绝对路径读（本机或直接 SSH）。 */
export type TerminalFileLinkStay = {
  read: TerminalFileLinkHostRead | null
}

export type TerminalFileLinkKeptOpen = {
  readOnly: true
  hostRead: TerminalFileLinkHostRead | null
}

type SettingRender = (
  settings: object,
  updateSettings: (updates: Partial<GlobalSettings>) => void
) => ReactNode

let keepsCurrentWorkspace: (() => boolean) | undefined
let renderSetting: SettingRender | undefined
let searchEntries: (() => TerminalFileLinkWorkspaceSearchEntry[]) | undefined
let rememberStay: ((fileId: string, hostRead: TerminalFileLinkHostRead | null) => void) | undefined
let lookupStay: ((fileId: string) => TerminalFileLinkStay | null) | undefined

export function registerTerminalFileLinkWorkspace(next: {
  keepsCurrentWorkspace: () => boolean
  renderSetting: SettingRender
  searchEntries: () => TerminalFileLinkWorkspaceSearchEntry[]
  rememberStay?: (fileId: string, hostRead: TerminalFileLinkHostRead | null) => void
  lookupStay?: (fileId: string) => TerminalFileLinkStay | null
}): void {
  keepsCurrentWorkspace = next.keepsCurrentWorkspace
  renderSetting = next.renderSetting
  searchEntries = next.searchEntries
  rememberStay = next.rememberStay
  lookupStay = next.lookupStay
}

/** 登记且当前设置为开时返回 true。未登记时返回 false，调用方保持上游。 */
export function terminalFileLinkKeepsCurrentWorkspace(): boolean {
  return keepsCurrentWorkspace?.() === true
}

/**
 * 开关打开、且路径属于或已经开在另一个工作区时，留在点击时的工作区并只读。
 * 配对运行时带上主机的相对路径；本机和直接 SSH 不带，仍读绝对路径。未登记或关闭时返回 null。
 */
export function terminalFileLinkKeptOpen(input: {
  sourceWorktreeId: string
  ownerWorktreeId: string | null
  ownerRelativePath: string | null
  openElsewhere: boolean
}): TerminalFileLinkKeptOpen | null {
  if (!terminalFileLinkKeepsCurrentWorkspace()) {
    return null
  }
  const foreignOwner =
    input.ownerWorktreeId !== null && input.ownerWorktreeId !== input.sourceWorktreeId
  if (!foreignOwner && !input.openElsewhere) {
    return null
  }
  const relativePath = input.ownerRelativePath
  return {
    readOnly: true,
    hostRead:
      foreignOwner &&
      input.ownerWorktreeId !== null &&
      relativePath !== null &&
      relativePath.length > 0
        ? { worktreeId: input.ownerWorktreeId, relativePath }
        : null
  }
}

export function rememberTerminalFileLinkStay(
  fileId: string,
  hostRead: TerminalFileLinkHostRead | null
): void {
  rememberStay?.(fileId, hostRead)
}

export function terminalFileLinkStay(fileId: string): TerminalFileLinkStay | null {
  return lookupStay?.(fileId) ?? null
}

export function renderTerminalFileLinkWorkspaceSetting(
  settings: object,
  updateSettings: (updates: Partial<GlobalSettings>) => void
): ReactNode {
  return renderSetting?.(settings, updateSettings) ?? null
}

export function terminalFileLinkWorkspaceSearchEntries(): TerminalFileLinkWorkspaceSearchEntry[] {
  return searchEntries?.() ?? []
}
