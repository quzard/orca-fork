// 设置里的开关。文案只走 fork 的中英覆盖层，搜索条目和界面用同一套键。
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import { SettingsSwitchRow } from '@/components/settings/SettingsFormControls'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  registerTerminalFileLinkWorkspace,
  type TerminalFileLinkWorkspaceSearchEntry
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import { forkTranslate } from '../i18n/fork-translate'
import type { OpenFile } from '@/store/slices/editor'
import { findWorkspaceFileRoute } from '@/lib/runtime-workspace-file-route'
import { getOpenFileExecutionHostId } from '@/lib/unified-tab-host-ownership'
import {
  demoteShallowerWritableCopies,
  terminalFileLinkCopyTouchedPaths
} from './file-link-nested-copy'
import { terminalFileLinksOpenInCurrentWorkspace } from './file-link-workspace'
import {
  applyTerminalFileLinkStayStorageEvent,
  forgetClosedTerminalFileLinkStays,
  loadTerminalFileLinkStay,
  nextTerminalFileLinkStayClosures,
  pruneTerminalFileLinkStays,
  rememberTerminalFileLinkStay,
  shouldSkipTerminalFileLinkStaySync,
  terminalFileLinkSessionHydrated
} from './file-link-stay'

const SEARCH_KEYWORDS = ['terminal', 'file', 'link', 'workspace', 'folder', 'chat']

function settingCopy(): { title: string; description: string } {
  return {
    title: forkTranslate(
      'fork.settings.terminalFileLinkWorkspace',
      'Open terminal and chat file links in the current workspace'
    ),
    description: forkTranslate(
      'fork.settings.terminalFileLinkWorkspaceDescription',
      'A file path clicked in a workspace terminal or native chat opens in that workspace, including when another workspace folder contains the path.'
    )
  }
}

function currentWorkspaceSettingUpdate(checked: boolean): Partial<GlobalSettings> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the profile JSON keeps this boolean beside GlobalSettings; the upstream type does not list it, and a missing value stays on.
  return { terminalFileLinksOpenInCurrentWorkspace: !checked } as Partial<GlobalSettings>
}

function TerminalFileLinkWorkspaceSetting({
  settings,
  updateSettings
}: {
  settings: object
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const { title, description } = settingCopy()
  const checked = terminalFileLinksOpenInCurrentWorkspace(settings)
  return (
    <SearchableSetting title={title} description={description} keywords={SEARCH_KEYWORDS}>
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={checked}
        onChange={() => updateSettings(currentWorkspaceSettingUpdate(checked))}
      />
    </SearchableSetting>
  )
}

export function terminalFileLinkWorkspaceSettingSearchEntries(): TerminalFileLinkWorkspaceSearchEntry[] {
  const { title, description } = settingCopy()
  return [{ title, description, keywords: SEARCH_KEYWORDS }]
}

let watchingClosedTabs = false
let unwatchClosedTabs: (() => void) | undefined
let stayStorageListener: ((event: StorageEvent) => void) | undefined

export function resetTerminalFileLinkWorkspaceWatchForTests(): void {
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

function applyShallowerCopyDemotion(
  state: AppState,
  previousFiles: readonly OpenFile[] | null,
  previousDrafts: Record<string, string> | undefined
): boolean {
  if (!terminalFileLinksOpenInCurrentWorkspace(state.settings)) {
    return false
  }
  const touched =
    previousFiles === null
      ? null
      : terminalFileLinkCopyTouchedPaths(
          previousFiles,
          state.openFiles,
          previousDrafts,
          state.editorDrafts
        )
  const demoted =
    state.worktreesByRepo == null && state.folderWorkspaces == null
      ? null
      : demoteShallowerWritableCopies(
          state.openFiles,
          (file) => {
            if (touched && !touched.has(file.filePath)) {
              return null
            }
            const route = findWorkspaceFileRoute(
              state,
              getOpenFileExecutionHostId(file),
              file.filePath
            )
            return route && route.worktreeId !== file.worktreeId ? route.worktreeId : null
          },
          getOpenFileExecutionHostId,
          (file) => tabHasUnsavedEdits(state, file)
        )
  if (!demoted || typeof useAppStore.setState !== 'function') {
    return false
  }
  useAppStore.setState({ openFiles: demoted })
  return true
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
  let openFiles = useAppStore.getState().openFiles
  let drafts = useAppStore.getState().editorDrafts
  let pendingClosed: { worktreeId: string; filePath: string }[] = []
  let pruned = false
  const initial = useAppStore.getState()
  if (terminalFileLinkSessionHydrated(initial.workspaceSessionReady, initial.hydrationSucceeded)) {
    pruned = true
    pruneTerminalFileLinkStays(openFiles)
  }
  if (applyShallowerCopyDemotion(initial, null, undefined)) {
    openFiles = useAppStore.getState().openFiles
    drafts = useAppStore.getState().editorDrafts
  }
  unwatchClosedTabs = useAppStore.subscribe((state) => {
    const hydrated = terminalFileLinkSessionHydrated(
      state.workspaceSessionReady,
      state.hydrationSucceeded
    )
    const filesChanged = state.openFiles !== openFiles
    const draftsChanged = state.editorDrafts !== drafts
    if ((filesChanged || draftsChanged) && applyShallowerCopyDemotion(state, openFiles, drafts)) {
      openFiles = useAppStore.getState().openFiles
      drafts = useAppStore.getState().editorDrafts
      return
    }
    drafts = state.editorDrafts
    if (shouldSkipTerminalFileLinkStaySync(!filesChanged, hydrated, pruned)) {
      return
    }
    const previous = openFiles
    openFiles = state.openFiles
    if (!hydrated) {
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
  })
}

export function registerTerminalFileLinkWorkspaceSetting(): void {
  registerTerminalFileLinkWorkspace({
    keepsCurrentWorkspace: () =>
      terminalFileLinksOpenInCurrentWorkspace(useAppStore.getState().settings),
    renderSetting: (settings, updateSettings) => (
      <TerminalFileLinkWorkspaceSetting settings={settings} updateSettings={updateSettings} />
    ),
    searchEntries: terminalFileLinkWorkspaceSettingSearchEntries,
    rememberStay: (worktreeId, filePath, fileId) => {
      const openFile = useAppStore.getState().openFiles.find((file) => file.id === fileId)
      rememberTerminalFileLinkStay(worktreeId, filePath, openFile)
    },
    lookupStay: loadTerminalFileLinkStay
  })
  watchClosedTerminalFileLinkStays()
}
