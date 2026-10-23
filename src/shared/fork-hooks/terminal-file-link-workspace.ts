// fork: 终端或原生对话里点开的文件是否留在点击时所在的工作区。
// 未登记时保持上游：路径落在另一个工作区里就可以切过去。

import type { ReactNode } from 'react'
import { relativePathInsideRoot } from '../cross-platform-path'
import type { ExecutionHostId } from '../execution-host'
import { isFloatingWorkspaceId } from '../floating-workspace-worktree'
import type { GlobalSettings } from '../global-settings-types'

export type TerminalFileLinkWorkspaceSearchEntry = {
  title: string
  description?: string
  keywords?: string[]
}

export type TerminalFileLinkOwner = {
  worktreeId: string
  worktreePath: string
  absolutePath: string
  isDirectory: boolean
}

type DownloadContext = {
  worktreeId?: string | null
  worktreePath?: string | null
}

export type TerminalFileLinkKeptOpen = {
  fileFields: { readOnly: true }
  absolutePath?: string
  stat?: { isDirectory: boolean; escapesWorktree: true }
  withDownloadContext: <T extends DownloadContext>(context: T) => T
  remember: (opened: { surface: string; fileId?: string }) => void
}

type OpenFileRef = { filePath: string; worktreeId: string }

export type TerminalFileLinkSiblingRoute = {
  worktreeId: string
  executionHostId: ExecutionHostId
  relativePath: string
}

type SettingRender = (
  settings: object,
  updateSettings: (updates: Partial<GlobalSettings>) => void
) => ReactNode

let keepsCurrentWorkspace: (() => boolean) | undefined
let renderSetting: SettingRender | undefined
let searchEntries: (() => TerminalFileLinkWorkspaceSearchEntry[]) | undefined
let rememberStay: ((worktreeId: string, filePath: string, fileId: string) => void) | undefined
let lookupStay: ((worktreeId: string, filePath: string) => boolean) | undefined

export function registerTerminalFileLinkWorkspace(next: {
  keepsCurrentWorkspace: () => boolean
  renderSetting: SettingRender
  searchEntries: () => TerminalFileLinkWorkspaceSearchEntry[]
  rememberStay?: (worktreeId: string, filePath: string, fileId: string) => void
  lookupStay?: (worktreeId: string, filePath: string) => boolean
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

function keptPlan(input: {
  sourceWorktreeId: string
  filePath: string
  absolutePath?: string
  stat?: { isDirectory: boolean; escapesWorktree: true }
  downloadOver?: DownloadContext
}): TerminalFileLinkKeptOpen {
  return {
    fileFields: { readOnly: true },
    absolutePath: input.absolutePath,
    stat: input.stat,
    withDownloadContext: <T extends DownloadContext>(context: T): T => {
      if (!input.downloadOver) {
        return context
      }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the overlay only replaces worktreeId and worktreePath, which this download context already carries.
      return { ...context, ...input.downloadOver } as T
    },
    remember: (opened) => {
      if (opened.surface !== 'editor' || !opened.fileId) {
        return
      }
      rememberStay?.(input.sourceWorktreeId, input.filePath, opened.fileId)
    }
  }
}

/**
 * 主机已经指出另一个工作区拥有这个路径。开关打开时留在点击时的工作区。
 * 未登记、关闭、或本来就是当前工作区时返回 null，调用方按上游打开。
 */
export function keepTerminalLinkInSource(input: {
  linkOwner: TerminalFileLinkOwner
  sourceWorktreeId: string
}): TerminalFileLinkKeptOpen | null {
  if (!terminalFileLinkKeepsCurrentWorkspace()) {
    return null
  }
  const { linkOwner, sourceWorktreeId } = input
  if (linkOwner.worktreeId === sourceWorktreeId) {
    return null
  }
  const relativePath = relativePathInsideRoot(linkOwner.worktreePath, linkOwner.absolutePath)
  if (!relativePath) {
    return null
  }
  return keptPlan({
    sourceWorktreeId,
    filePath: linkOwner.absolutePath,
    absolutePath: linkOwner.absolutePath,
    stat: { isDirectory: linkOwner.isDirectory, escapesWorktree: true },
    downloadOver: { worktreeId: linkOwner.worktreeId, worktreePath: linkOwner.worktreePath }
  })
}

/**
 * 开关打开时，路径属于别的工作区、已经在别的工作区打开、或当前根下面还有更深的工作区拥有它，留在这里并只读。
 * 可编辑的那一份属于根最深的工作区。开关关闭时只做上游那次「别处已打开就改挂」，
 * 路径在当前根里（含正好等于根）仍返回 null。调用方把 findWorkspaceFileRoute 传进来，
 * 未登记钩子的测试也不会漏掉这次改挂。浮动工作区、授权文件返回 null。
 */
export function resolveSiblingTerminalFileLink<State extends { openFiles: readonly OpenFileRef[] }>(
  store: State,
  sourceWorktreeId: string,
  sourceWorktreePath: string,
  executionHostId: ExecutionHostId,
  filePath: string,
  blocked: boolean,
  findRoute: (
    state: State,
    executionHostId: ExecutionHostId,
    absolutePath: string
  ) => TerminalFileLinkSiblingRoute | null
): {
  kept: TerminalFileLinkKeptOpen | null
  route: TerminalFileLinkSiblingRoute | null
} | null {
  if (blocked || isFloatingWorkspaceId(sourceWorktreeId)) {
    return null
  }
  const openElsewhere = store.openFiles.some(
    (file) => file.filePath === filePath && file.worktreeId !== sourceWorktreeId
  )
  // null：不在这个根里。''：正好是根，点根仍走上游的激活。
  const relative = relativePathInsideRoot(sourceWorktreePath, filePath)
  if (terminalFileLinkKeepsCurrentWorkspace()) {
    if (relative !== null) {
      if (relative.length === 0) {
        return null
      }
      const route = findRoute(store, executionHostId, filePath)
      if (!route || route.worktreeId === sourceWorktreeId) {
        return null
      }
      return { kept: keptPlan({ sourceWorktreeId, filePath }), route: null }
    }
    const route = findRoute(store, executionHostId, filePath)
    const foreignOwner = route !== null && route.worktreeId !== sourceWorktreeId
    if (!foreignOwner && !openElsewhere) {
      return null
    }
    return { kept: keptPlan({ sourceWorktreeId, filePath }), route: null }
  }
  if (relative !== null || !openElsewhere) {
    return null
  }
  const route = findRoute(store, executionHostId, filePath)
  if (!route) {
    return null
  }
  return { kept: null, route }
}

/** 开关关闭时当作没有标记，已留下的标签重新按上游重挂、按上游读。 */
export function terminalFileLinkStay(worktreeId: string | undefined, filePath: string): boolean {
  if (!worktreeId || !terminalFileLinkKeepsCurrentWorkspace()) {
    return false
  }
  return lookupStay?.(worktreeId, filePath) === true
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
