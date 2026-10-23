// 设置里的开关。文案只走 fork 的中英覆盖层，搜索条目和界面用同一套键。
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import { SettingsSwitchRow } from '@/components/settings/SettingsFormControls'
import { useAppStore } from '@/store'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  registerTerminalFileLinkWorkspace,
  type TerminalFileLinkWorkspaceSearchEntry
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import { forkTranslate } from '../i18n/fork-translate'
import { terminalFileLinksOpenInCurrentWorkspace } from './file-link-workspace'
import {
  applyTerminalFileLinkStayStorageEvent,
  forgetClosedTerminalFileLinkStays,
  loadTerminalFileLinkStay,
  pruneTerminalFileLinkStays,
  rememberTerminalFileLinkStay,
  shouldSkipTerminalFileLinkStaySync
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

function watchClosedTerminalFileLinkStays(): void {
  if (watchingClosedTabs) {
    return
  }
  watchingClosedTabs = true
  // 节点测试没有 window。网页里另一个标签页改了存储时，用那份记录替换缓存。
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      applyTerminalFileLinkStayStorageEvent(event.key, event.newValue)
    })
  }
  let openFiles = useAppStore.getState().openFiles
  let pruned = false
  if (useAppStore.getState().workspaceSessionReady === true) {
    pruned = true
    pruneTerminalFileLinkStays(openFiles)
  }
  useAppStore.subscribe((state) => {
    const ready = state.workspaceSessionReady === true
    if (shouldSkipTerminalFileLinkStaySync(state.openFiles === openFiles, ready, pruned)) {
      return
    }
    const previous = openFiles
    openFiles = state.openFiles
    if (!ready) {
      return
    }
    if (!pruned) {
      pruned = true
      pruneTerminalFileLinkStays(openFiles)
      return
    }
    forgetClosedTerminalFileLinkStays(previous, openFiles)
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
