// 远程 HTML 打开应用内文档预览，字节仍走 orca-preview。
// 必须是 .tsx：引用渲染进程的 @/ 别名，node 工程只收录 src/fork/**/*.ts。
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { resolveSshWorkspaceBrowserRouteEligibility } from '@/lib/ssh-workspace-browser-route-eligibility'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { basename, dirname } from '@/lib/path'
import { useAppStore } from '@/store'
import { isHtmlFilePath } from '@/components/terminal-pane/local-html-file-destinations'
import { HostFileRefusal } from '@/components/terminal-pane/host-file-refusal'
import type { HostWorkspaceFile } from '@/components/terminal-pane/terminal-host-workspace-file'
import type { TerminalFileContext } from '@/components/terminal-pane/terminal-file-path-mapping'
import { ORCA_BROWSER_BLANK_URL } from '../../shared/constants'
import { isPathInsideOrEqual, relativePathInsideRoot } from '../../shared/cross-platform-path'
import {
  isRuntimeOwnedSshTargetId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../shared/execution-host'
import {
  rememberTerminalHtmlPreview,
  unmarkAddressBarTerminalHtmlPreview,
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

export function sshDirectoryLocation(
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

type SshBrowserRoute = { targetId: string; environmentId: string | null; eligible: boolean }

/**
 * 和 SSH 路由浏览器同一条资格。点 HTML 时开关关掉也算：file:// 读的仍是这台 Mac。
 * `eligible` 只给事后拉回用。开关关掉时标签在本机分区，手贴的本机 file:// 不能收成远端预览。
 */
export function sshBrowserRoute(
  worktreeId: string,
  state = useAppStore.getState()
): SshBrowserRoute | null {
  const hostId = getExecutionHostIdForWorktree(state, worktreeId)
  const environments = Array.isArray(state.runtimeEnvironments)
    ? state.runtimeEnvironments
    : undefined
  const route = resolveSshWorkspaceBrowserRouteEligibility(hostId, state.settings, environments)
  if (!route) {
    return null
  }
  const parsed = parseExecutionHostId(hostId)
  return {
    targetId: route.targetId,
    environmentId: parsed?.kind === 'runtime' ? parsed.environmentId : null,
    eligible: route.eligible
  }
}

/** 没有 SSH 路由时，已记下的预览仍可拉回。路由在、但开关关掉时不要动本机分区里的页。 */
export function sshRoutedHtmlMayReclaim(worktreeId: string): boolean {
  const route = sshBrowserRoute(worktreeId)
  return !route || route.eligible
}

function runtimeWorktreeLocation(
  environmentId: string,
  worktreeId: string,
  worktreePath: string,
  absolutePath: string
): TerminalHtmlPreviewLocation | null {
  const relative = relativePathInsideRoot(worktreePath, absolutePath)
  if (!relative) {
    return null
  }
  return {
    owner: {
      kind: 'runtime',
      environmentId,
      worktreeSelector: toRuntimeWorktreeSelector(worktreeId),
      worktreeRoot: worktreePath
    },
    requestBase: worktreePath,
    root: dirname(absolutePath),
    entryRelativePath: relative
  }
}

/**
 * 点击被当成这台 Mac 的文件时，上游会开 file://。SSH 分区里的 Chromium 读不到远端路径。
 * 工作区里的托管运行时走 files.read。工作区外走已有的 SSH 预览。直连 SSH 工作区里的 HTML 不抢走。
 */
function sshRoutedDocumentLocation(args: OpenArgs): TerminalHtmlPreviewLocation | null {
  const route = sshBrowserRoute(args.worktreeId)
  const managed = managedSshConnectionId(args.fileContext)
  const environmentId =
    args.fileContext.target.kind === 'environment'
      ? args.fileContext.target.environmentId
      : (route?.environmentId ?? null)
  if (!outsideClickedWorktree(args)) {
    const root = args.fileContext.worktreePath
    if (environmentId && root && (managed || route?.environmentId)) {
      return runtimeWorktreeLocation(environmentId, args.worktreeId, root, args.mappedFilePath)
    }
    return null
  }
  const targetId = managed ?? route?.targetId ?? null
  if (!targetId) {
    return null
  }
  return sshDirectoryLocation(targetId, args.mappedFilePath)
}

/**
 * 文件上下文没有运行时、也没有连接时，上游把 HTML 交给系统浏览器或 file://。
 * 工作区其实走 SSH 路由时先标上目标，后面的预览才接得到。直连 SSH 工作区里的 HTML 不标。
 */
export function fileContextForSshHtml(
  fileContext: TerminalFileContext,
  worktreeId: string,
  mappedFilePath: string,
  statResult: { escapesWorktree: boolean }
): TerminalFileContext {
  if (
    !isHtmlFilePath(mappedFilePath) ||
    fileContext.connectionId ||
    fileContext.target.kind === 'environment'
  ) {
    return fileContext
  }
  const route = sshBrowserRoute(worktreeId)
  if (!route) {
    return fileContext
  }
  const root = fileContext.worktreePath
  const outside = !root || statResult.escapesWorktree || !isPathInsideOrEqual(root, mappedFilePath)
  if (!route.environmentId && !outside) {
    return fileContext
  }
  return { ...fileContext, connectionId: route.targetId }
}

/**
 * 预览铸不出来、又要退回编辑器时，标上去的 sshTargetId 不能当成桌面 SSH 连接。
 * 只有工作区外的绝对路径会带上 externalSshTargetId。托管部署上桌面往往没有这条连接，
 * 编辑器会报「工作区主机变了」。改成只读打开，运行时 id 用部署所在的环境，不带这条连接。
 * 工作区外运行时读不到，编辑器报路径在工作区外。工作区里的 HTML 仍交给文档预览计划。
 */
export function openManagedSshHtmlSourceFallback(args: {
  fileContext: TerminalFileContext
  mappedFilePath: string
  worktreeId: string
  statResult: { escapesWorktree: boolean }
}): boolean {
  if (args.fileContext.target.kind === 'environment' || !args.fileContext.connectionId) {
    return false
  }
  const route = sshBrowserRoute(args.worktreeId)
  if (!route?.environmentId || route.targetId !== args.fileContext.connectionId) {
    return false
  }
  const root = args.fileContext.worktreePath
  const outside =
    !root || args.statResult.escapesWorktree || !isPathInsideOrEqual(root, args.mappedFilePath)
  if (!outside) {
    return false
  }
  activateAndRevealWorkspace(args.worktreeId, {
    providesInitialSurface: true,
    executionHostId: toRuntimeExecutionHostId(route.environmentId)
  })
  useAppStore.getState().openFile(
    {
      filePath: args.mappedFilePath,
      relativePath: args.mappedFilePath,
      worktreeId: args.worktreeId,
      runtimeEnvironmentId: route.environmentId,
      readOnly: true,
      language: 'html',
      mode: 'edit'
    },
    { forceContentReload: true }
  )
  return true
}

function previewLocation(args: OpenArgs): TerminalHtmlPreviewLocation | null {
  // SSH 文件路由上的授权读会被 terminal_file_grant_mismatch 拒绝，所以有真实部署时先走 SSH。
  return (
    managedSshLocation(args) ??
    artifactLocation(args) ??
    ownerWorkspaceLocation(args) ??
    sshOutsideLocation(args) ??
    sshRoutedDocumentLocation(args)
  )
}

/**
 * 托管 SSH 上 orcad 拒绝本机磁盘授权时，工作区外的 HTML 仍打开预览，不 toast。
 * 远端其实没有这个文件时，预览是 404。没有真实 sshTargetId 时返回 null，调用方保持原来的拒绝。
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

/** 已经开成浏览器页的 HTML：工作区里走 files.read，其余走 SSH 预览。 */
export function sshRoutedBrowserHtmlLocation(
  worktreeId: string,
  filePath: string,
  worktreePath: string | null
): TerminalHtmlPreviewLocation | null {
  const route = sshBrowserRoute(worktreeId)
  if (!route) {
    return null
  }
  if (route.environmentId && worktreePath && isPathInsideOrEqual(worktreePath, filePath)) {
    return runtimeWorktreeLocation(route.environmentId, worktreeId, worktreePath, filePath)
  }
  return sshDirectoryLocation(route.targetId, filePath)
}

/**
 * 托管 SSH 上的 HTML（工作区里和工作区外）、归属在别的工作区里的 HTML、以及直连 SSH 工作区外的 HTML，
 * 打开应用内文档预览。本地 HTML 和直连 SSH 工作区里的 HTML 返回 false，调用方保持上游。
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
  // 点击重写了同一条路径。关路由时只清地址栏写的记录，不能把这次点击也清掉。
  unmarkAddressBarTerminalHtmlPreview(args.worktreeId, args.mappedFilePath)
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
