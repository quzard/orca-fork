import { downloadAndOpenRemoteTerminalFile } from './terminal-remote-file-download-open'
import { isMissingRuntimePathError } from '@/runtime/runtime-file-metadata-client'
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace, activateAndRevealWorktree } from '@/lib/worktree-activation'
import {
  resolveKnownWorktreeRootPathLink,
  terminalFileSourceHost
} from './terminal-worktree-path-link'
import {
  getTerminalFileContext,
  mapTerminalFilePath,
  shouldOpenTerminalFileWithSystemDefault,
  terminalLinkWslDistro
} from './terminal-file-path-mapping'
import {
  LOCAL_EXECUTION_HOST_ID,
  getConnectionExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../../shared/execution-host'
import type { HostWorkspaceFile } from './terminal-host-workspace-file'
import {
  openTerminalHtmlUnlessSshSource,
  placeRetainedTerminalLink,
  resolveAndRetainTerminalLink,
  terminalLinkOpenFields
} from '../../../../fork/terminal/file-link-route'
import { captureEditorOpenLinkIntent } from '@/store/slices/editor/tabs/editor-open-target-group'
import { reserveDetectedFilePathOpenTurn } from './terminal-file-open-turn'
export { isHtmlFilePath } from './local-html-file-destinations'
import { refuseOpenInGroupRequest } from './terminal-file-open-in-group-toast'
import { isExplicitEditorScopeKept, openLinkedFileInEditor } from './terminal-file-link-editor-open'

export {
  getTerminalFileContext,
  mapTerminalFilePath,
  shouldOpenTerminalFileWithSystemDefault,
  terminalLinkWslDistro,
  terminalPathWslDistro,
  type TerminalFileContext
} from './terminal-file-path-mapping'
import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'
import {
  httpLinkDirectClickDestination,
  type HttpLinkDestination
} from '@/lib/http-link-destinations'
import { isHtmlFilePath, localHtmlFileDestinations } from './local-html-file-destinations'

export type FileOpenFailure = {
  /** `missing` is a verified absence; `unverifiable` means the host could not answer (dropped SSH, timeout, denied path). */
  verdict: 'missing' | 'unverifiable'
  error: unknown
}

type TerminalFileOpenDeps = {
  worktreeId: string
  worktreePath: string
  runtimeEnvironmentId?: string | null
  wslDistro?: string | null
  /** Shift+modifier: the OS default app, or the other link-routing browser for a local HTML file. */
  openWithSystemDefault?: boolean
  /** Where a local HTML file opens, chosen from its popover; otherwise link routing decides. */
  browserDestination?: HttpLinkDestination
  /** The paired-server terminal that printed the link; lets its host grant a file outside workspaces. */
  terminalHandle?: string | null
  hostFileOnly?: boolean
  /** Reports a path that could not be verified before opening; skipped once a later open supersedes it. */
  onOpenFailure?: (failure: FileOpenFailure) => void
  /** The tab that owns the link; editor opens place themselves relative to its group. */
  sourceTabId?: string | null
  /** "Open in this group": pins the source tab's group at activation, or refuses. */
  openInSourceGroup?: boolean
  /** Opt-in menu request; the legacy flag remains editor-only. */
  openInSourceGroupSurface?: 'internal' | 'browser'
}

export function openDetectedFilePath(
  filePath: string,
  line: number | null,
  column: number | null,
  deps: TerminalFileOpenDeps
): void {
  const { openWithSystemDefault = false, runtimeEnvironmentId } = deps
  let { worktreeId, worktreePath } = deps
  let mappedFilePath = mapTerminalFilePath(
    filePath,
    worktreePath,
    terminalLinkWslDistro(deps.wslDistro, runtimeEnvironmentId)
  )
  const isCurrentRequest = reserveDetectedFilePathOpenTurn()
  const explicitGroupRequest =
    deps.openInSourceGroup === true || deps.openInSourceGroupSurface !== undefined
  // Why: capture at activation; focus may move while the host resolves the path.
  const linkIntent = captureEditorOpenLinkIntent(
    useAppStore.getState(),
    deps.worktreeId,
    deps.sourceTabId,
    { explicitSourceGroup: explicitGroupRequest }
  )
  const refuseExplicitNonEditorRoute = (): boolean =>
    refuseOpenInGroupRequest(mappedFilePath, explicitGroupRequest, isCurrentRequest)
  const linkContext = deps.sourceTabId ? { linkIntent, isCurrentRequest } : undefined
  if (explicitGroupRequest && !linkIntent) {
    refuseExplicitNonEditorRoute()
    return
  }

  void (async () => {
    let statResult
    let fileContext = getTerminalFileContext(worktreeId, worktreePath, runtimeEnvironmentId)
    const sourceFileHostId =
      terminalFileSourceHost(useAppStore.getState(), fileContext) ??
      getConnectionExecutionHostId(fileContext.connectionId)
    const sourceRuntimeOwnerId = runtimeTargetEnvironmentId(fileContext.target)
    let hostWorkspaceFile: HostWorkspaceFile | null = null
    let hostGrantId: string | null = null
    let hostGrantReadOnly = false
    let clientLocal = false
    if (!fileContext.sourceHostResolved) {
      if (refuseExplicitNonEditorRoute()) {
        return
      }
      // Why: with no owner the host is unknown — refuse rather than touch this machine's files.
      deps.onOpenFailure?.({
        verdict: 'unverifiable',
        error: new Error('The terminal workspace host could not be determined')
      })
      return
    }
    if (!openWithSystemDefault) {
      const worktreeRootLink = resolveKnownWorktreeRootPathLink(
        mappedFilePath,
        useAppStore.getState(),
        fileContext
      )
      if (worktreeRootLink) {
        if (refuseExplicitNonEditorRoute()) {
          return
        }
        // Switch root workspace for SSH/runtime paths without local auth/stat; coalesce provider and fallback clicks.
        await Promise.resolve()
        if (!isCurrentRequest()) {
          return
        }
        activateAndRevealWorktree(worktreeRootLink.id, {
          executionHostId: worktreeRootLink.executionHostId
        })
        return
      }
    }

    let stayView: Awaited<ReturnType<typeof resolveAndRetainTerminalLink>>['stayView'] = null
    try {
      // fork: 上游解析之后，SSH/服务器文件留在点击时的工作区。本地跨工作区仍切走。
      ;({
        fileContext,
        worktreeId,
        worktreePath,
        mappedFilePath,
        statResult,
        hostWorkspaceFile,
        hostGrantId,
        hostGrantReadOnly,
        clientLocal,
        stayView
      } = await resolveAndRetainTerminalLink({
        fileContext,
        worktreeId,
        worktreePath,
        mappedFilePath,
        terminalHandle: deps.terminalHandle,
        hostFileOnly: deps.hostFileOnly
      }))
    } catch (error) {
      if (isCurrentRequest() && deps.onOpenFailure) {
        // Why: loss of contact with the host is not evidence the file is gone.
        deps.onOpenFailure({
          verdict: isMissingRuntimePathError(error) ? 'missing' : 'unverifiable',
          error
        })
      }
      return
    }

    if (!isCurrentRequest()) {
      return
    }

    const canOpenWithSystemDefault = shouldOpenTerminalFileWithSystemDefault(fileContext)
    if (explicitGroupRequest && openWithSystemDefault) {
      refuseExplicitNonEditorRoute()
      return
    }
    // Remote hints promise Orca before resolution; explicit group requests must reach HTML branch to be refused.
    const pageDestination =
      canOpenWithSystemDefault &&
      !clientLocal &&
      hostGrantId === null &&
      !explicitGroupRequest &&
      isHtmlFilePath(mappedFilePath)
        ? (deps.browserDestination ??
          httpLinkDirectClickDestination(localHtmlFileDestinations(), openWithSystemDefault))
        : null
    const opensWithSystemDefault = pageDestination
      ? pageDestination === 'system'
      : openWithSystemDefault
    if (opensWithSystemDefault && canOpenWithSystemDefault) {
      // Shift+Cmd/Ctrl follows URL-link behavior and OS file associations without new editor settings.
      const openedWithSystemDefault = await window.api.shell.openFilePath(
        mappedFilePath,
        LOCAL_EXECUTION_HOST_ID
      )
      if (openedWithSystemDefault || statResult.isDirectory) {
        return
      }
    }

    if (statResult.isDirectory) {
      if (refuseExplicitNonEditorRoute()) {
        return
      }
      if (canOpenWithSystemDefault) {
        await window.api.shell.openFilePath(mappedFilePath, LOCAL_EXECUTION_HOST_ID)
      }
      return
    }

    // Why: a granted file is readable only through its grant, so it opens in Orca, never as a download.
    if (openWithSystemDefault && !canOpenWithSystemDefault && hostGrantId === null) {
      // Shift+Cmd/Ctrl must match popover’s Download & open with default app; OS cannot directly launch remote paths.
      await downloadAndOpenRemoteTerminalFile(fileContext, mappedFilePath)
      return
    }

    // 托管主机工作区外的 HTML、直连 SSH 工作区外的 HTML 打开应用内预览。本地 HTML 走上游。判断在 file-link-route。
    if (
      openTerminalHtmlUnlessSshSource({
        mappedFilePath,
        hostGrantId,
        fileContext,
        statResult,
        worktreeId,
        clientLocal,
        canOpenWithSystemDefault,
        hostWorkspaceFile,
        sourceFileHostId,
        linkContext,
        openInSourceGroup: deps.openInSourceGroup,
        explicitGroupRequest,
        refuseExplicitNonEditorRoute
      })
    ) {
      return
    }

    if (deps.openInSourceGroupSurface === 'browser') {
      refuseExplicitNonEditorRoute()
      return
    }

    const runtimeOwnerId = runtimeTargetEnvironmentId(fileContext.target) ?? sourceRuntimeOwnerId
    // fork: 嵌套只读和同路径碰撞都在 file-link-route，避免这个文件超过行数上限。
    const placed = placeRetainedTerminalLink({
      stayView,
      worktreeId,
      worktreePath,
      mappedFilePath,
      escapesWorktree: statResult.escapesWorktree,
      hostGrantId,
      targetExecutionHostId:
        hostWorkspaceFile?.executionHostId ??
        (runtimeOwnerId
          ? toRuntimeExecutionHostId(runtimeOwnerId)
          : getConnectionExecutionHostId(fileContext.connectionId))
    })
    stayView = placed.stayView
    const targetWorktreeId = placed.targetWorktreeId
    const targetExecutionHostId = placed.targetExecutionHostId
    const relativePath = placed.relativePath

    if (
      explicitGroupRequest &&
      !isExplicitEditorScopeKept(linkIntent, targetWorktreeId, targetExecutionHostId, clientLocal)
    ) {
      // Why: refuse before activating the destination or touching editor state.
      refuseExplicitNonEditorRoute()
      return
    }

    if (targetWorktreeId) {
      // Route by workspace shape and resolved host: folder keys are valid and worktree ids can repeat across hosts.
      activateAndRevealWorkspace(targetWorktreeId, {
        providesInitialSurface: true,
        executionHostId: targetExecutionHostId
      })
    }

    const opened = openLinkedFileInEditor(
      {
        filePath: mappedFilePath,
        relativePath,
        worktreeId: targetWorktreeId || '',
        runtimeEnvironmentId: clientLocal ? null : runtimeEnvironmentId,
        // Why: a tab's owner must match its workspace's to be editable; this one is this computer's.
        ...terminalLinkOpenFields(
          clientLocal,
          targetWorktreeId,
          worktreeId,
          stayView,
          runtimeEnvironmentId,
          hostGrantId,
          hostGrantReadOnly,
          relativePath,
          filePath,
          fileContext
        )
      },
      linkIntent,
      { line, column },
      isCurrentRequest
    )
    if (!opened) {
      refuseExplicitNonEditorRoute()
    }
  })()
}
