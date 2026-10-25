import { downloadAndOpenRemoteTerminalFile } from './terminal-remote-file-download-open'
import { findWorkspaceFileRoute } from '@/lib/runtime-workspace-file-route'
import { isPathInsideWorktree, toWorktreeRelativePath } from '@/lib/terminal-links'
<<<<<<< HEAD
import type { RuntimeWorkspaceFileRoute } from '@/lib/runtime-workspace-file-route'
import {
  findTerminalFileLinkRoute,
  terminalLinkViewFields
} from '../../../../fork/terminal/file-link-route'
import { canClientOsOpenWorkspaceFile } from '@/lib/workspace-file-host-routing'
=======
>>>>>>> 2f25699094cff58c67746f7048ea7900e14e61e8
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
import { statUserOpenedPath } from '@/lib/user-opened-local-path'
import {
  CLIENT_LOCAL_FILE_TARGET,
  resolveHostWorkspaceFile,
  type HostWorkspaceFile
} from './terminal-host-workspace-file'
import { isFloatingWorkspaceId } from '../../../../shared/floating-workspace-worktree'
import { captureEditorOpenLinkIntent } from '@/store/slices/editor/tabs/editor-open-target-group'
import { reserveDetectedFilePathOpenTurn } from './terminal-file-open-turn'
<<<<<<< HEAD
import { openHtmlFileInBrowser } from './terminal-html-file-browser-open'
import { showOpenInGroupRefusedToast } from './terminal-file-open-in-group-toast'
import {
  dismissFileInOtherWorkspaceHint,
  showFileInOtherWorkspaceHint
} from './terminal-file-other-workspace-hint'
import { siblingWorkspaceLink } from './terminal-file-other-workspace-owner'
import { resolveTerminalLinkFileOwner } from './terminal-file-link-owner-resolution'
=======
import { openTerminalHtmlFileInBrowser } from './terminal-file-link-browser-open'
export { isHtmlFilePath } from './local-html-file-destinations'
import { refuseOpenInGroupRequest } from './terminal-file-open-in-group-toast'
>>>>>>> 2f25699094cff58c67746f7048ea7900e14e61e8
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
import {
  deeperWorkspaceReadOnlyView,
  retainSshServerLinkInSource,
  terminalHtmlKeepsEditorSource
} from '../../../../shared/fork-hooks/terminal-file-link-workspace'

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

    try {
      const linkOwner = await resolveHostWorkspaceFile(
        fileContext,
        mappedFilePath,
        deps.terminalHandle
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
        // Why: the host already stat'ed the path inside the workspace that holds it; open it there.
        ;({ worktreeId, worktreePath, absolutePath: mappedFilePath } = hostWorkspaceFile)
        fileContext = { ...fileContext, worktreeId, worktreePath }
        statResult = { isDirectory: hostWorkspaceFile.isDirectory, escapesWorktree: false }
      } else {
        statResult = await statUserOpenedPath(fileContext, mappedFilePath)
      }
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
<<<<<<< HEAD
    // fork: SSH/服务器上、归属不是当前工作区的文件留在这里，只读，不切走。
    const held = retainSshServerLinkInSource(
      owner,
      { worktreeId, worktreePath, fileContext: sourceContext },
      findTerminalFileLinkRoute
    )
    owner = held.owner
    const { fileContext, stat: statResult, hostWorkspaceFile, hostGrantId, clientLocal } = owner
    let otherWorkspaceOwner: RuntimeWorkspaceFileRoute | null = held.view
    ;({ worktreeId, worktreePath, filePath: mappedFilePath } = owner)
=======
>>>>>>> 2f25699094cff58c67746f7048ea7900e14e61e8

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

    // Route local HTML to Orca browser, including system-browser opens OS could not launch.
    if (isHtmlFilePath(mappedFilePath) && hostGrantId === null) {
      if (deps.openInSourceGroup) {
        refuseExplicitNonEditorRoute()
        return
      }
<<<<<<< HEAD
      // Why: the same gesture renders remote HTML too, through the doc preview; only an
      // unsupported plan (e.g. a paired doc outside the worktree) falls back to source.
      // fork: 工作区外的直接 SSH HTML 仍打开源码。本地 HTML 不走这个判断。
      if (!terminalHtmlKeepsEditorSource({ fileContext, mappedFilePath, statResult })) {
        const plan = getWorkspaceFilePreviewPlan(useAppStore.getState(), worktreeId, mappedFilePath)
        if (plan.status === 'doc-preview') {
          if (refuseExplicitNonEditorRoute()) {
            return
          }
          activateAndRevealWorktree(worktreeId, { providesInitialSurface: true })
          openFileInBrowserTab({ filePath: mappedFilePath, worktreeId })
          return
        }
=======
      const fileExecutionHostId = hostWorkspaceFile?.executionHostId ?? sourceFileHostId
      if (
        openTerminalHtmlFileInBrowser({
          filePath: mappedFilePath,
          worktreeId,
          clientLocal,
          canOpenWithSystemDefault,
          ...(linkContext && !clientLocal ? { fileExecutionHostId } : {}),
          linkContext,
          ...(explicitGroupRequest ? { refuseOpenInSourceGroup: refuseExplicitNonEditorRoute } : {})
        })
      ) {
        return
>>>>>>> 2f25699094cff58c67746f7048ea7900e14e61e8
      }
    }

    if (deps.openInSourceGroupSurface === 'browser') {
      refuseExplicitNonEditorRoute()
      return
    }

    const store = useAppStore.getState()
    let targetWorktreeId = worktreeId
    const runtimeOwnerId = runtimeTargetEnvironmentId(fileContext.target) ?? sourceRuntimeOwnerId
    let targetExecutionHostId =
      hostWorkspaceFile?.executionHostId ??
      (runtimeOwnerId
        ? toRuntimeExecutionHostId(runtimeOwnerId)
        : getConnectionExecutionHostId(fileContext.connectionId))
    let relativePath = mappedFilePath
    if (worktreePath && isPathInsideWorktree(mappedFilePath, worktreePath)) {
<<<<<<< HEAD
      // fork: 当前根下面还有更深的工作区拥有这个文件时，留在这里只读。
      const ownedHere =
        otherWorkspaceOwner ??
        deeperWorkspaceReadOnlyView(
          targetExecutionHostId,
          mappedFilePath,
          worktreeId,
          findTerminalFileLinkRoute
        )
      if (ownedHere) {
        otherWorkspaceOwner = ownedHere
      } else {
        const maybeRelative = toWorktreeRelativePath(mappedFilePath, worktreePath)
        // Why: a link out of the project keeps its absolute path, so the tab reads it as the file
        // the user named, before and after a restart, instead of being refused as a project file.
        if (maybeRelative !== null && maybeRelative.length > 0 && !statResult.escapesWorktree) {
          relativePath = maybeRelative
        }
=======
      const maybeRelative = toWorktreeRelativePath(mappedFilePath, worktreePath)
      // Keep out-of-project absolute paths so restored tabs still name the user’s external file instead of refusing it as a project file.
      if (maybeRelative !== null && maybeRelative.length > 0 && !statResult.escapesWorktree) {
        relativePath = maybeRelative
>>>>>>> 2f25699094cff58c67746f7048ea7900e14e61e8
      }
    } else if (
      hostGrantId === null &&
      !isFloatingWorkspaceId(worktreeId) &&
      store.openFiles.some(
        (openFile) => openFile.filePath === mappedFilePath && openFile.worktreeId !== worktreeId
      )
    ) {
      // Why: early resolution is only needed to avoid an existing sibling-tab collision.
      const siblingRoute = findWorkspaceFileRoute(store, targetExecutionHostId, mappedFilePath)
      if (siblingRoute) {
        targetWorktreeId = siblingRoute.worktreeId
        targetExecutionHostId = siblingRoute.executionHostId
        relativePath = siblingRoute.relativePath
      }
    }

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
<<<<<<< HEAD
        // Why: a tab's owner must match its workspace's to be editable; this one is this computer's,
        // or another workspace's, which "Open there" edits under its own owner.
        ...(clientLocal
          ? { readOnly: true }
          : terminalLinkViewFields(otherWorkspaceOwner, runtimeEnvironmentId)),
=======
        // Why: a tab's owner must match its workspace's to be editable; this one is this computer's.
        ...(clientLocal && targetWorktreeId === worktreeId ? { readOnly: true } : {}),
>>>>>>> 2f25699094cff58c67746f7048ea7900e14e61e8
        // Why: the grant is the only authority to read a host file outside its workspaces.
        ...(hostGrantId !== null ? { readOnly: true, terminalArtifactGrantId: hostGrantId } : {}),
        // Retain SSH owner or restored absolute remote paths become indistinguishable from client-local external files.
        ...(relativePath === filePath &&
        fileContext.target.kind === 'local' &&
        fileContext.connectionId
          ? { externalSshTargetId: fileContext.connectionId }
          : {})
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
