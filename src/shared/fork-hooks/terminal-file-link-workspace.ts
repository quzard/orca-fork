// fork: 终端或原生对话里点开的 SSH/服务器文件留在点击时的工作区。
// 未登记时两个钩子都不改上游：本地跨工作区只读视图、以及跳进归属工作区，都由上游自己决定。

import { isPathInsideOrEqual, relativePathInsideRoot } from '../cross-platform-path'
import {
  LOCAL_EXECUTION_HOST_ID,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../execution-host'
import { isFloatingWorkspaceId } from '../floating-workspace-worktree'

/** 另一个工作区里的同一路径。相对路径给「在那边打开」用，调用方只拿来标只读。 */
export type TerminalFileLinkRoute = {
  worktreeId: string
  relativePath: string
  executionHostId: ExecutionHostId
}

type HostFile = {
  kind: 'host'
  absolutePath: string
  worktreeId: string
  worktreePath: string
  executionHostId: ExecutionHostId
  isDirectory: boolean
}

type LinkOwner = {
  fileContext: {
    connectionId?: string | null
    target: { kind: string }
    worktreePath?: string | null
  }
  worktreeId: string
  worktreePath: string
  filePath: string
  stat: { isDirectory: boolean; escapesWorktree: boolean }
  hostWorkspaceFile: HostFile | null
  hostGrantId: string | null
  clientLocal: boolean
}

type RouteLookup = (
  executionHostId: ExecutionHostId,
  absolutePath: string
) => TerminalFileLinkRoute | null

let active = false
let rememberSshStay: ((worktreeId: string, filePath: string) => void) | undefined
let lookupStay: ((worktreeId: string, filePath: string) => boolean) | undefined

export function registerTerminalFileLinkWorkspace(next: {
  rememberSshStay: (worktreeId: string, filePath: string) => void
  lookupStay: (worktreeId: string, filePath: string) => boolean
}): void {
  active = true
  rememberSshStay = next.rememberSshStay
  lookupStay = next.lookupStay
}

/** 测试撤掉登记，确认未登记时远程 HTML 仍走上游。 */
export function resetTerminalFileLinkWorkspaceForTests(): void {
  active = false
  rememberSshStay = undefined
  lookupStay = undefined
}

/** 终端链接钩子是否已经登记。未登记时远程 HTML 仍走上游。 */
export function terminalFileLinkWorkspaceRegistered(): boolean {
  return active
}

/** 只读的 SSH 或服务器标签才查停留标记。本地只读绝对路径不查，未登记时为 false。 */
export function terminalSshServerStay(
  file:
    | {
        readOnly?: boolean
        externalSshTargetId?: string | null
        runtimeEnvironmentId?: string | null
      }
    | undefined,
  worktreeId: string | undefined,
  filePath: string
): boolean {
  if (file?.readOnly !== true) {
    return false
  }
  const remote =
    Boolean(file.externalSshTargetId?.trim()) || Boolean(file.runtimeEnvironmentId?.trim())
  return remote && terminalFileLinkStay(worktreeId, filePath)
}

/** 这个工作区是否记下过该 SSH/服务器路径。未登记时当作没有标记。 */
export function terminalFileLinkStay(worktreeId: string | undefined, filePath: string): boolean {
  if (!active || !worktreeId) {
    return false
  }
  return lookupStay?.(worktreeId, filePath) === true
}

function hold<T extends LinkOwner>(
  owner: T,
  sourceWorktreeId: string,
  sourceWorktreePath: string,
  sourceContext: T['fileContext'],
  host: HostFile,
  view: TerminalFileLinkRoute
): { owner: T; view: TerminalFileLinkRoute } {
  rememberSshStay?.(sourceWorktreeId, host.absolutePath)
  return {
    // 留在点击时的工作区，但保留宿主给出的归属，后面的同级跳转就会跳过。
    owner: {
      ...owner,
      worktreeId: sourceWorktreeId,
      worktreePath: sourceWorktreePath,
      fileContext: sourceContext,
      hostWorkspaceFile: host,
      stat: { isDirectory: host.isDirectory, escapesWorktree: true }
    },
    view
  }
}

/**
 * 宿主解析（resolveHostWorkspaceFile）返回并套用上游归属之后调用。
 * SSH 或服务器上、归属不是当前工作区的文件，改成上游的只读视图，不切走。
 * 授权文件、本机文件、浮动工作区、以及点在工作区根上，都原样返回。
 */
export function retainSshServerLinkInSource<T extends LinkOwner>(
  owner: T,
  source: {
    worktreeId: string
    worktreePath: string
    fileContext: T['fileContext']
  },
  findRoute: RouteLookup
): { owner: T; view: TerminalFileLinkRoute | null } {
  if (
    !active ||
    owner.clientLocal ||
    owner.hostGrantId !== null ||
    isFloatingWorkspaceId(source.worktreeId)
  ) {
    return { owner, view: null }
  }
  const host = owner.hostWorkspaceFile
  if (
    host &&
    host.worktreeId !== source.worktreeId &&
    host.executionHostId !== LOCAL_EXECUTION_HOST_ID
  ) {
    const relativePath = relativePathInsideRoot(host.worktreePath, host.absolutePath)
    // 空串是点在根上，仍交给上游激活那个工作区。
    if (!relativePath) {
      return { owner, view: null }
    }
    return hold(owner, source.worktreeId, source.worktreePath, source.fileContext, host, {
      worktreeId: host.worktreeId,
      relativePath,
      executionHostId: host.executionHostId
    })
  }
  const connectionId = source.fileContext.connectionId
  if (!host && connectionId && source.fileContext.target.kind === 'local') {
    const route = findRoute(toSshExecutionHostId(connectionId), owner.filePath)
    if (route && route.worktreeId !== source.worktreeId) {
      return hold(
        owner,
        source.worktreeId,
        source.worktreePath,
        source.fileContext,
        {
          kind: 'host',
          absolutePath: owner.filePath,
          worktreeId: route.worktreeId,
          worktreePath: source.worktreePath,
          executionHostId: route.executionHostId,
          isDirectory: owner.stat.isDirectory
        },
        route
      )
    }
  }
  return { owner, view: null }
}

/**
 * 路径落在当前工作区里面时调用。更深的工作区拥有它，就改成只读视图。
 * 只有 SSH/服务器才记停留；本地只读视图由上游读，不写标记。
 */
export function deeperWorkspaceReadOnlyView(
  executionHostId: ExecutionHostId,
  absolutePath: string,
  sourceWorktreeId: string,
  findRoute: RouteLookup
): TerminalFileLinkRoute | null {
  if (!active || isFloatingWorkspaceId(sourceWorktreeId)) {
    return null
  }
  const route = findRoute(executionHostId, absolutePath)
  if (!route || route.worktreeId === sourceWorktreeId) {
    return null
  }
  if (executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    rememberSshStay?.(sourceWorktreeId, absolutePath)
  }
  return route
}

/**
 * 工作区外的直接 SSH HTML。文档预览的常规计划读不到这台桌面上的 ssh: 文件。
 * 调用方改走应用内预览，并由 fork 按这条连接读文件。本地 HTML 不经过这里。
 * 未登记时返回 false，调用方保持上游预览。
 */
export function terminalHtmlIsDirectSshOutsideWorktree(input: {
  fileContext: {
    connectionId?: string | null
    target: { kind: string }
    worktreePath?: string | null
  }
  mappedFilePath: string
  statResult: { escapesWorktree: boolean }
}): boolean {
  if (!active) {
    return false
  }
  const root = input.fileContext.worktreePath
  // 空根不能当成「/」，否则任何绝对路径都会被算进工作区。
  const insideWorktree = root ? isPathInsideOrEqual(root, input.mappedFilePath) : false
  return (
    Boolean(input.fileContext.connectionId) &&
    input.fileContext.target.kind === 'local' &&
    (input.statResult.escapesWorktree || !insideWorktree)
  )
}
