// 更深工作区打开同一路径后，把外层可写标签降为只读，并清掉已经关掉的停留标记。
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { registerTerminalFileLinkWorkspace } from '../../shared/fork-hooks/terminal-file-link-workspace'
import type { OpenFile } from '@/store/slices/editor'
import { findWorkspaceFileRoute } from '@/lib/runtime-workspace-file-route'
import { getOpenFileExecutionHostId } from '@/lib/unified-tab-host-ownership'
import {
  demoteShallowerWritableCopies,
  terminalFileLinkCopyTouchedPaths
} from './file-link-nested-copy'
import {
  applyTerminalFileLinkStayStorageEvent,
  forgetClosedTerminalFileLinkStays,
  loadTerminalFileLinkStay,
  nextTerminalFileLinkStayClosures,
  pruneTerminalFileLinkStays,
  saveTerminalFileLinkStay,
  shouldSkipTerminalFileLinkStaySync,
  terminalFileLinkSessionHydrated
} from './file-link-stay'

let watchingClosedTabs = false
let unwatchClosedTabs: (() => void) | undefined
let stayStorageListener: ((event: StorageEvent) => void) | undefined

export function resetTerminalFileLinkStayWatchForTests(): void {
  unwatchClosedTabs?.()
  unwatchClosedTabs = undefined
  if (stayStorageListener && typeof window !== 'undefined') {
    window.removeEventListener('storage', stayStorageListener)
  }
  stayStorageListener = undefined
  watchingClosedTabs = false
}

function tabHasUnsavedEdits(state: AppState, file: OpenFile): boolean {
  if (state.editorDrafts?.[file.id] !== undefined) {
    return true
  }
  const recordId = state.editorBufferIdOf?.[file.id]
  return recordId !== undefined && state.editorBuffers?.[recordId]?.isDirty === true
}

// 工作区列表晚到时，两张可写标签都没变，仍要整表再查。
function workspaceCatalogChanged(state: AppState, previous: AppState): boolean {
  return (
    state.worktreesByRepo !== previous.worktreesByRepo ||
    state.folderWorkspaces !== previous.folderWorkspaces
  )
}

function ownerLookupPaths(
  recheckAll: boolean,
  previousFiles: readonly OpenFile[] | null,
  state: AppState,
  previousDrafts: Record<string, string> | undefined,
  unresolved: ReadonlySet<string>
): Set<string> | null {
  if (recheckAll || previousFiles === null) {
    return null
  }
  const touched = terminalFileLinkCopyTouchedPaths(
    previousFiles,
    state.openFiles,
    previousDrafts,
    state.editorDrafts
  )
  // 上次没解析出归属的路径，这次即使标签没变也再查。
  for (const filePath of unresolved) {
    touched.add(filePath)
  }
  return touched
}

function retainUnresolvedEditPaths(unresolved: Set<string>, openFiles: readonly OpenFile[]): void {
  const retryable = new Set(
    openFiles
      .filter((file) => file.readOnly !== true && (file.mode === undefined || file.mode === 'edit'))
      .map((file) => file.filePath)
  )
  for (const filePath of unresolved) {
    if (!retryable.has(filePath)) {
      unresolved.delete(filePath)
    }
  }
}

function shallowerCopyDemotion(
  state: AppState,
  previousFiles: readonly OpenFile[] | null,
  previousDrafts: Record<string, string> | undefined,
  unresolved: Set<string>,
  recheckAll: boolean
): OpenFile[] | null {
  retainUnresolvedEditPaths(unresolved, state.openFiles)
  if (state.worktreesByRepo == null && state.folderWorkspaces == null) {
    return null
  }
  const touched = ownerLookupPaths(recheckAll, previousFiles, state, previousDrafts, unresolved)
  return demoteShallowerWritableCopies(
    state.openFiles,
    (file) => {
      if (touched && !touched.has(file.filePath)) {
        return null
      }
      const route = findWorkspaceFileRoute(state, getOpenFileExecutionHostId(file), file.filePath)
      if (route) {
        unresolved.delete(file.filePath)
      } else {
        unresolved.add(file.filePath)
      }
      return route && route.worktreeId !== file.worktreeId ? route.worktreeId : null
    },
    getOpenFileExecutionHostId,
    (file) => tabHasUnsavedEdits(state, file)
  )
}

function watchClosedTerminalFileLinkStays(): void {
  if (watchingClosedTabs) {
    return
  }
  watchingClosedTabs = true
  // 节点测试没有 window。网页里另一个标签页改了存储时，用那份记录替换缓存。
  if (typeof window !== 'undefined') {
    stayStorageListener = (event) => {
      applyTerminalFileLinkStayStorageEvent(event.key, event.newValue)
    }
    window.addEventListener('storage', stayStorageListener)
  }
  let openFiles: readonly OpenFile[] = useAppStore.getState().openFiles
  let drafts = useAppStore.getState().editorDrafts
  let catalog = useAppStore.getState()
  const unresolved = new Set<string>()
  let pendingClosed: { worktreeId: string; filePath: string }[] = []
  let pruned = false
  const initial = useAppStore.getState()
  if (terminalFileLinkSessionHydrated(initial.workspaceSessionReady, initial.hydrationSucceeded)) {
    pruned = true
    pruneTerminalFileLinkStays(openFiles)
  }
  const initialDemoted = shallowerCopyDemotion(initial, null, undefined, unresolved, true)
  if (initialDemoted && typeof useAppStore.setState === 'function') {
    openFiles = initialDemoted
    drafts = initial.editorDrafts
    useAppStore.setState({ openFiles: initialDemoted })
  }
  function noteOpenFileList(nextFiles: readonly OpenFile[], sessionHydrated: boolean): void {
    if (shouldSkipTerminalFileLinkStaySync(nextFiles === openFiles, sessionHydrated, pruned)) {
      return
    }
    const previous = openFiles
    openFiles = nextFiles
    if (!sessionHydrated) {
      return
    }
    if (!pruned) {
      pruned = true
      pendingClosed = []
      pruneTerminalFileLinkStays(openFiles)
      return
    }
    const next = nextTerminalFileLinkStayClosures(pendingClosed, previous, openFiles)
    if (next.confirmed.length > 0) {
      forgetClosedTerminalFileLinkStays(next.confirmed, openFiles)
    }
    pendingClosed = next.pending
  }
  unwatchClosedTabs = useAppStore.subscribe((state) => {
    const hydrated = terminalFileLinkSessionHydrated(
      state.workspaceSessionReady,
      state.hydrationSucceeded
    )
    const filesChanged = state.openFiles !== openFiles
    const draftsChanged = state.editorDrafts !== drafts
    const recheckAll = workspaceCatalogChanged(state, catalog)
    catalog = state
    if (recheckAll || filesChanged || draftsChanged) {
      const demoted = shallowerCopyDemotion(state, openFiles, drafts, unresolved, recheckAll)
      if (demoted && typeof useAppStore.setState === 'function') {
        // 降级会换掉保存的列表。先按这次的新旧列表记下关掉的标记，否则要等下次启动才清。
        noteOpenFileList(state.openFiles, hydrated)
        openFiles = demoted
        drafts = state.editorDrafts
        useAppStore.setState({ openFiles: demoted })
        return
      }
    }
    drafts = state.editorDrafts
    noteOpenFileList(state.openFiles, hydrated)
  })
}

// 开关已经去掉。这里只登记停留标记的读写，并开始监视外层标签。
export function registerTerminalFileLinkStayWatch(): void {
  registerTerminalFileLinkWorkspace({
    rememberSshStay: (worktreeId, filePath) => {
      saveTerminalFileLinkStay(worktreeId, filePath)
    },
    lookupStay: loadTerminalFileLinkStay
  })
  watchClosedTerminalFileLinkStays()
}
