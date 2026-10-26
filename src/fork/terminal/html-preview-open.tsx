// 远程 HTML 打开应用内文档预览，字节仍走 orca-preview。
// 必须是 .tsx：引用渲染进程的 @/ 别名，node 工程只收录 src/fork/**/*.ts。
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { basename, dirname } from '@/lib/path'
import { useAppStore } from '@/store'
import type { HostWorkspaceFile } from '@/components/terminal-pane/terminal-host-workspace-file'
import type { TerminalFileContext } from '@/components/terminal-pane/terminal-file-path-mapping'
import { ORCA_BROWSER_BLANK_URL } from '../../shared/constants'
import { relativePathInsideRoot } from '../../shared/cross-platform-path'
import { parseExecutionHostId } from '../../shared/execution-host'
import {
  rememberTerminalHtmlPreview,
  type TerminalHtmlPreviewLocation
} from '../../shared/fork-hooks/terminal-html-preview'
import {
  terminalFileLinkWorkspaceRegistered,
  terminalHtmlIsDirectSshOutsideWorktree
} from '../../shared/fork-hooks/terminal-file-link-workspace'
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
  const directory = dirname(args.mappedFilePath)
  const entry = basename(args.mappedFilePath)
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

function previewLocation(args: OpenArgs): TerminalHtmlPreviewLocation | null {
  return artifactLocation(args) ?? ownerWorkspaceLocation(args) ?? sshOutsideLocation(args)
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
