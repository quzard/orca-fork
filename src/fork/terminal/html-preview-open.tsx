// 远程 HTML 打开应用内文档预览，字节仍走 orca-preview。
// 必须是 .tsx：引用渲染进程的 @/ 别名，node 工程只收录 src/fork/**/*.ts。
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { basename, dirname } from '@/lib/path'
import { useAppStore } from '@/store'
import { isHtmlFilePath } from '@/components/terminal-pane/local-html-file-destinations'
import {
  HostFileRefusal,
  type HostWorkspaceFile
} from '@/components/terminal-pane/terminal-host-workspace-file'
import type { TerminalFileContext } from '@/components/terminal-pane/terminal-file-path-mapping'
import { ORCA_BROWSER_BLANK_URL } from '../../shared/constants'
import { isPathInsideOrEqual, relativePathInsideRoot } from '../../shared/cross-platform-path'
import { isRuntimeOwnedSshTargetId, parseExecutionHostId } from '../../shared/execution-host'
import {
  lookupTerminalHtmlPreview,
  rememberTerminalHtmlPreview,
  type TerminalHtmlPreviewLocation
} from '../../shared/fork-hooks/terminal-html-preview'
import {
  terminalFileLinkWorkspaceRegistered,
  terminalHtmlIsDirectSshOutsideWorktree
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import { getOrcadSshDeployment } from '../../shared/runtime-environments'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'

type OpenArgs = {
  mappedFilePath: string
  hostGrantId: string | null
  fileContext: TerminalFileContext
  statResult: { escapesWorktree: boolean }
  worktreeId: string
  hostWorkspaceFile: HostWorkspaceFile | null
}

function artifactLocation(args: OpenArgs): TerminalHtmlPreviewLocation | null {
  if (!args.hostGrantId || args.fileContext.target.kind !== 'environment') {
    return null
  }
  const directory = dirname(args.mappedFilePath)
  const entry = basename(args.mappedFilePath)
  if (!directory || !entry) {
    return null
  }
  return {
    owner: {
      kind: 'runtime',
      environmentId: args.fileContext.target.environmentId,
      worktreeSelector: toRuntimeWorktreeSelector(args.worktreeId),
      // 相对地址落在文件自己的目录。读取不走工作区 files.readDocPreview，只读这一份授权。
      worktreeRoot: directory
    },
    requestBase: directory,
    root: directory,
    entryRelativePath: entry,
    terminalArtifactGrantId: args.hostGrantId,
    terminalArtifactAbsolutePath: args.mappedFilePath
  }
}

function ownerWorkspaceLocation(args: OpenArgs): TerminalHtmlPreviewLocation | null {
  const host = args.hostWorkspaceFile
  if (!host || host.worktreeId === args.worktreeId) {
    return null
  }
  const parsed = parseExecutionHostId(host.executionHostId)
  if (parsed?.kind !== 'runtime') {
    return null
  }
  const relative = relativePathInsideRoot(host.worktreePath, args.mappedFilePath)
  if (!relative) {
    return null
  }
  return {
    owner: {
      kind: 'runtime',
      environmentId: parsed.environmentId,
      worktreeSelector: toRuntimeWorktreeSelector(host.worktreeId),
      worktreeRoot: host.worktreePath
    },
    requestBase: host.worktreePath,
    root: dirname(args.mappedFilePath),
    entryRelativePath: relative
  }
}

/** 托管 orcad 落在真实 SSH 上时，用这条目标读工作区外的 HTML。临时 Orb（runtime-ssh-）仍走授权。 */
function managedSshConnectionId(fileContext: TerminalFileContext): string | null {
  if (fileContext.target.kind !== 'environment') {
    return null
  }
  const environmentId = fileContext.target.environmentId
  const listed = useAppStore.getState().runtimeEnvironments
  if (!Array.isArray(listed)) {
    return null
  }
  const environment = listed.find((entry) => entry.id === environmentId)
  const targetId = environment ? getOrcadSshDeployment(environment)?.sshTargetId : undefined
  if (!targetId || isRuntimeOwnedSshTargetId(targetId)) {
    return null
  }
  return targetId
}

function outsideClickedWorktree(args: OpenArgs): boolean {
  const root = args.fileContext.worktreePath
  if (!root) {
    return true
  }
  return args.statResult.escapesWorktree || !isPathInsideOrEqual(root, args.mappedFilePath)
}

function sshDirectoryLocation(
  connectionId: string,
  absolutePath: string
): TerminalHtmlPreviewLocation | null {
  const directory = dirname(absolutePath)
  const entry = basename(absolutePath)
  if (!directory || !entry) {
    return null
  }
  return {
    owner: { kind: 'ssh', connectionId },
    requestBase: directory,
    root: directory,
    entryRelativePath: entry,
    sshPreview: true
  }
}

function managedSshLocation(args: OpenArgs): TerminalHtmlPreviewLocation | null {
  if (!outsideClickedWorktree(args)) {
    return null
  }
  const connectionId = managedSshConnectionId(args.fileContext)
  if (!connectionId) {
    return null
  }
  return sshDirectoryLocation(connectionId, args.mappedFilePath)
}

function sshOutsideLocation(args: OpenArgs): TerminalHtmlPreviewLocation | null {
  if (
    !terminalHtmlIsDirectSshOutsideWorktree({
      fileContext: args.fileContext,
      mappedFilePath: args.mappedFilePath,
      statResult: args.statResult
    })
  ) {
    return null
  }
  const connectionId = args.fileContext.connectionId
  if (!connectionId) {
    return null
  }
  return sshDirectoryLocation(connectionId, args.mappedFilePath)
}

function previewLocation(args: OpenArgs): TerminalHtmlPreviewLocation | null {
  // SSH 文件路由上的授权读会被 terminal_file_grant_mismatch 拒绝，所以有真实部署时先走 SSH。
  return (
    managedSshLocation(args) ??
    artifactLocation(args) ??
    ownerWorkspaceLocation(args) ??
    sshOutsideLocation(args)
  )
}

/**
 * 托管 SSH 上 orcad 拒绝本机磁盘授权时，HTML 仍打开预览，不把「找不到」toast 掉。
 * 没有真实 sshTargetId 时返回 null，调用方保持原来的拒绝。
 */
export function htmlPreviewDespiteHostFileRefusal(
  error: unknown,
  fileContext: TerminalFileContext,
  mappedFilePath: string
): { isDirectory: false; escapesWorktree: true } | null {
  if (!(error instanceof HostFileRefusal) || !isHtmlFilePath(mappedFilePath)) {
    return null
  }
  if (!managedSshConnectionId(fileContext)) {
    return null
  }
  const root = fileContext.worktreePath
  // 工作区里的 HTML 找不到仍按原来拒绝。只有工作区外才改走 SSH 预览。
  if (root && isPathInsideOrEqual(root, mappedFilePath)) {
    return null
  }
  return { isDirectory: false, escapesWorktree: true }
}

type PreviewPage = {
  id: string
  url: string
  docLocation?: unknown
  browserRuntimeEnvironmentId?: string | null
}

/** 已经记下预览、页面却把绝对路径写进了 SSH 浏览器时，拉回文档预览。手贴且没点过的路径不在记录里。 */
export function sshRoutedHtmlPreviewRecovery(state: {
  browserTabsByWorktree: Record<string, { id: string }[]>
  browserPagesByWorkspace: Record<string, PreviewPage[] | undefined>
}): { pageId: string; worktreeId: string; filePath: string } | null {
  for (const [worktreeId, tabs] of Object.entries(state.browserTabsByWorktree)) {
    for (const tab of tabs) {
      for (const page of state.browserPagesByWorkspace[tab.id] ?? []) {
        if (page.docLocation || page.browserRuntimeEnvironmentId !== null) {
          continue
        }
        const filePath = page.url.trim()
        if (!filePath.startsWith('/') || filePath.includes('://') || !isHtmlFilePath(filePath)) {
          continue
        }
        if (!lookupTerminalHtmlPreview(worktreeId, filePath)) {
          continue
        }
        return { pageId: page.id, worktreeId, filePath }
      }
    }
  }
  return null
}

const recoveredPreviewPages = new Set<string>()

/** 裸路径进 SSH 分区会变成 file://，本机没有这个文件，地址栏留下绝对路径和 ERR_FILE_NOT_FOUND。 */
export function installSshRoutedHtmlPreviewRecovery(): void {
  useAppStore.subscribe((state) => {
    const recovery = sshRoutedHtmlPreviewRecovery(state)
    if (!recovery || recoveredPreviewPages.has(recovery.pageId)) {
      return
    }
    recoveredPreviewPages.add(recovery.pageId)
    const converted = useAppStore.getState().convertBrowserPage(recovery.pageId, {
      kind: 'workspace-doc',
      docLocation: {
        kind: 'workspace-doc',
        worktreeId: recovery.worktreeId,
        filePath: recovery.filePath
      }
    })
    if (!converted) {
      recoveredPreviewPages.delete(recovery.pageId)
    }
  })
}

/**
 * 托管主机上没有工作区认领的 HTML、归属在别的工作区里的 HTML、以及直连 SSH 工作区外的 HTML，
 * 打开应用内文档预览。本地和工作区里的 HTML 返回 false，调用方保持上游。
 */
export function openRemoteTerminalHtmlPreview(args: OpenArgs): boolean {
  // 没登记终端链接钩子时不改上游：本地系统浏览器、工作区里的文档预览都留在原来的路径。
  if (!terminalFileLinkWorkspaceRegistered()) {
    return false
  }
  const location = previewLocation(args)
  if (!location) {
    return false
  }
  rememberTerminalHtmlPreview(args.worktreeId, args.mappedFilePath, location)
  activateAndRevealWorkspace(args.worktreeId, { providesInitialSurface: true })
  useAppStore.getState().createBrowserTab(args.worktreeId, ORCA_BROWSER_BLANK_URL, {
    docLocation: {
      kind: 'workspace-doc',
      worktreeId: args.worktreeId,
      filePath: args.mappedFilePath
    },
    title: basename(args.mappedFilePath) || args.mappedFilePath,
    activate: true,
    // 预览授权在这台桌面铸出，页面留在本机，哪怕文件在远端。
    browserRuntimeEnvironmentId: null
  })
  return true
}
