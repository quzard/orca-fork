// 路由文件不能直接依赖商店查找，否则会越过行数上限。查找、停留和只读字段放在这里。
// 必须是 .tsx：它引用渲染进程的 @/ 别名，而 node 工程只收录 src/fork/**/*.ts。
// 写成 .ts 时 pnpm tc 会在 node 工程里解析这些别名失败。
import { findWorkspaceFileRoute } from '@/lib/runtime-workspace-file-route'
import { useAppStore } from '@/store'
import { toWorktreeRelativePath } from '@/lib/terminal-links'
import { isHtmlFilePath } from '@/components/terminal-pane/local-html-file-destinations'
import { openTerminalHtmlFileInBrowser } from '@/components/terminal-pane/terminal-file-link-browser-open'
import type { BrowserLinkOpenContext } from '@/lib/browser-link-destination'
import { statUserOpenedPath } from '@/lib/user-opened-local-path'
import {
  CLIENT_LOCAL_FILE_TARGET,
  resolveHostWorkspaceFile,
  type HostWorkspaceFile
} from '@/components/terminal-pane/terminal-host-workspace-file'
import type { TerminalFileContext } from '@/components/terminal-pane/terminal-file-path-mapping'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../shared/execution-host'
import { isFloatingWorkspaceId } from '../../shared/floating-workspace-worktree'
import {
  deeperWorkspaceReadOnlyView,
  retainSshServerLinkInSource,
  terminalHtmlKeepsEditorSource,
  type TerminalFileLinkRoute
} from '../../shared/fork-hooks/terminal-file-link-workspace'

export function findTerminalFileLinkRoute(
  executionHostId: ExecutionHostId,
  absolutePath: string
): TerminalFileLinkRoute | null {
  return findWorkspaceFileRoute(useAppStore.getState(), executionHostId, absolutePath)
}

type LinkStat = { isDirectory: boolean; escapesWorktree: boolean }

export type ResolvedTerminalLink = {
  fileContext: TerminalFileContext
  worktreeId: string
  worktreePath: string
  mappedFilePath: string
  statResult: LinkStat
  hostWorkspaceFile: HostWorkspaceFile | null
  hostGrantId: string | null
  clientLocal: boolean
  stayView: TerminalFileLinkRoute | null
}

/**
 * 先走上游的宿主解析（本地跨工作区会切到归属工作区），再挂 SSH/服务器停留。
 * 停留时打开目标改回点击时的工作区，并给出只读视图。未登记时停留钩子不改结果。
 */
export async function resolveAndRetainTerminalLink(input: {
  fileContext: TerminalFileContext
  worktreeId: string
  worktreePath: string
  mappedFilePath: string
  terminalHandle?: string | null
}): Promise<ResolvedTerminalLink> {
  const sourceWorktreeId = input.worktreeId
  const sourceWorktreePath = input.worktreePath
  const sourceFileContext = input.fileContext
  let fileContext = input.fileContext
  let worktreeId = input.worktreeId
  let worktreePath = input.worktreePath
  let mappedFilePath = input.mappedFilePath
  let hostWorkspaceFile: HostWorkspaceFile | null = null
  let hostGrantId: string | null = null
  let clientLocal = false
  let statResult: LinkStat
  const linkOwner = await resolveHostWorkspaceFile(
    fileContext,
    mappedFilePath,
    input.terminalHandle
  )
  if (linkOwner?.kind === 'grant') {
    hostGrantId = linkOwner.grantId
    mappedFilePath = linkOwner.absolutePath
    statResult = { isDirectory: false, escapesWorktree: true }
  } else if (linkOwner?.kind === 'client') {
    clientLocal = true
    fileContext = {
      ...fileContext,
      target: CLIENT_LOCAL_FILE_TARGET,
      connectionId: undefined
    }
    statResult = { isDirectory: linkOwner.isDirectory, escapesWorktree: false }
  } else if (linkOwner) {
    hostWorkspaceFile = linkOwner
    // 宿主已经 stat 过归属工作区里的路径，上游先在那边打开。
    ;({ worktreeId, worktreePath, absolutePath: mappedFilePath } = hostWorkspaceFile)
    fileContext = { ...fileContext, worktreeId, worktreePath }
    statResult = { isDirectory: hostWorkspaceFile.isDirectory, escapesWorktree: false }
  } else {
    statResult = await statUserOpenedPath(fileContext, mappedFilePath)
  }
  const held = retainSshServerLinkInSource(
    {
      fileContext,
      worktreeId,
      worktreePath,
      filePath: mappedFilePath,
      stat: statResult,
      hostWorkspaceFile,
      hostGrantId,
      clientLocal
    },
    {
      worktreeId: sourceWorktreeId,
      worktreePath: sourceWorktreePath,
      fileContext: sourceFileContext
    },
    findTerminalFileLinkRoute
  )
  return {
    fileContext: held.owner.fileContext,
    worktreeId: held.owner.worktreeId,
    worktreePath: held.owner.worktreePath,
    mappedFilePath: held.owner.filePath,
    statResult: held.owner.stat,
    hostWorkspaceFile: held.owner.hostWorkspaceFile,
    hostGrantId,
    clientLocal,
    stayView: held.view
  }
}

/**
 * 路径落在当前工作区里面时：更深的工作区拥有它就改成只读视图，否则仍用上游的相对路径。
 * 已经决定停留的 SSH/服务器链接不再改成外层的可写相对路径。
 */
export function nestedTerminalLinkPath(input: {
  stayView: TerminalFileLinkRoute | null
  executionHostId: ExecutionHostId
  absolutePath: string
  sourceWorktreeId: string
  worktreePath: string
  escapesWorktree: boolean
}): { stayView: TerminalFileLinkRoute | null; relativePath: string } {
  const nested =
    input.stayView ??
    deeperWorkspaceReadOnlyView(
      input.executionHostId,
      input.absolutePath,
      input.sourceWorktreeId,
      findTerminalFileLinkRoute
    )
  if (nested) {
    return { stayView: nested, relativePath: input.absolutePath }
  }
  const maybeRelative = toWorktreeRelativePath(input.absolutePath, input.worktreePath)
  if (maybeRelative !== null && maybeRelative.length > 0 && !input.escapesWorktree) {
    return { stayView: null, relativePath: maybeRelative }
  }
  return { stayView: null, relativePath: input.absolutePath }
}

/**
 * 上游 #33304 删掉了只读标记辅助函数。停留视图仍然只读。
 * 本地视图不带运行时 id。服务器视图要留着，否则重新打开时会被当成这台电脑上的文件。
 */
export function terminalLinkViewFields(
  owner: TerminalFileLinkRoute | null,
  runtimeEnvironmentId: string | null | undefined
): { readOnly?: true; runtimeEnvironmentId?: string | null } {
  if (!owner) {
    return {}
  }
  if (owner.executionHostId === LOCAL_EXECUTION_HOST_ID || !runtimeEnvironmentId) {
    return { readOnly: true, runtimeEnvironmentId: null }
  }
  return { readOnly: true, runtimeEnvironmentId }
}

/**
 * 工作区外的直接 SSH HTML 留在编辑器里。其余 HTML 跟上游打开浏览器。
 * 放在这里是因为路由文件贴着行数上限。返回 true 表示这条链接已经处理完。
 */
export function openTerminalHtmlUnlessSshSource(args: {
  mappedFilePath: string
  hostGrantId: string | null
  fileContext: TerminalFileContext
  statResult: LinkStat
  openInSourceGroup: boolean | undefined
  worktreeId: string
  clientLocal: boolean
  canOpenWithSystemDefault: boolean
  hostWorkspaceFile: HostWorkspaceFile | null
  sourceFileHostId: ExecutionHostId | null
  linkContext: BrowserLinkOpenContext | undefined
  explicitGroupRequest: boolean
  refuseExplicitNonEditorRoute: () => boolean
}): boolean {
  if (!isHtmlFilePath(args.mappedFilePath) || args.hostGrantId !== null) {
    return false
  }
  if (args.openInSourceGroup) {
    args.refuseExplicitNonEditorRoute()
    return true
  }
  if (
    terminalHtmlKeepsEditorSource({
      fileContext: args.fileContext,
      mappedFilePath: args.mappedFilePath,
      statResult: args.statResult
    })
  ) {
    return false
  }
  const fileExecutionHostId = args.hostWorkspaceFile?.executionHostId ?? args.sourceFileHostId
  return openTerminalHtmlFileInBrowser({
    filePath: args.mappedFilePath,
    worktreeId: args.worktreeId,
    clientLocal: args.clientLocal,
    canOpenWithSystemDefault: args.canOpenWithSystemDefault,
    // 浏览器目标不接受 null。解析不到主机时省掉这个字段。
    ...(args.linkContext && !args.clientLocal && fileExecutionHostId !== null
      ? { fileExecutionHostId }
      : {}),
    linkContext: args.linkContext,
    ...(args.explicitGroupRequest
      ? { refuseOpenInSourceGroup: args.refuseExplicitNonEditorRoute }
      : {})
  })
}

/**
 * 上游的同路径碰撞：另一个工作区已经打开这个文件时，跳到那个工作区。
 * 已经决定停留时不跳。放在这里同样是为了路由文件的行数。
 */
export function adoptSiblingTerminalLink(args: {
  stayView: TerminalFileLinkRoute | null
  hostGrantId: string | null
  worktreeId: string
  mappedFilePath: string
  executionHostId: ExecutionHostId
}): { worktreeId: string; executionHostId: ExecutionHostId; relativePath: string } | null {
  if (args.stayView !== null || args.hostGrantId !== null) {
    return null
  }
  if (isFloatingWorkspaceId(args.worktreeId)) {
    return null
  }
  const store = useAppStore.getState()
  const collided = store.openFiles.some(
    (openFile) =>
      openFile.filePath === args.mappedFilePath && openFile.worktreeId !== args.worktreeId
  )
  if (!collided) {
    return null
  }
  // 只有已经撞上打开的标签时才查归属，和上游原来的时机一样。
  const siblingRoute = findWorkspaceFileRoute(store, args.executionHostId, args.mappedFilePath)
  if (!siblingRoute) {
    return null
  }
  return {
    worktreeId: siblingRoute.worktreeId,
    executionHostId: siblingRoute.executionHostId,
    relativePath: siblingRoute.relativePath
  }
}

/** 本机文件的只读条件跟上游。SSH 停留和嵌套降级再补只读字段；没有停留视图时不改上游。 */
export function terminalLinkOpenFields(
  clientLocal: boolean,
  targetWorktreeId: string,
  worktreeId: string,
  stayView: TerminalFileLinkRoute | null,
  runtimeEnvironmentId: string | null | undefined
): { readOnly?: true; runtimeEnvironmentId?: string | null } {
  if (clientLocal && targetWorktreeId === worktreeId) {
    return { readOnly: true }
  }
  return terminalLinkViewFields(clientLocal ? null : stayView, runtimeEnvironmentId)
}
