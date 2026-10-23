// 设置里的开关。文案只走 fork 的中英覆盖层，搜索条目和界面用同一套键。
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import { SettingsSwitchRow } from '@/components/settings/SettingsFormControls'
import { useAppStore } from '@/store'
import {
  registerTerminalFileLinkWorkspace,
  type TerminalFileLinkWorkspaceSearchEntry,
  type TerminalFileLinkWorkspaceSettings
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import { forkTranslate } from '../i18n/fork-translate'
import { terminalFileLinksOpenInCurrentWorkspace } from './file-link-workspace'

function settingCopy(): { title: string; description: string } {
  return {
    title: forkTranslate(
      'fork.settings.terminalFileLinkWorkspace',
      'Open terminal file links in the current workspace'
    ),
    description: forkTranslate(
      'fork.settings.terminalFileLinkWorkspaceDescription',
      'A file path clicked in a workspace terminal opens in that workspace, including when another workspace folder contains the path.'
    )
  }
}

function TerminalFileLinkWorkspaceSetting({
  settings,
  updateSettings
}: {
  settings: TerminalFileLinkWorkspaceSettings
  updateSettings: (updates: { terminalFileLinksOpenInCurrentWorkspace: boolean }) => void
}): React.JSX.Element {
  const { title, description } = settingCopy()
  const checked = terminalFileLinksOpenInCurrentWorkspace(settings)
  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['terminal', 'file', 'link', 'workspace', 'folder']}
    >
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={checked}
        onChange={() => updateSettings({ terminalFileLinksOpenInCurrentWorkspace: !checked })}
      />
    </SearchableSetting>
  )
}

export function terminalFileLinkWorkspaceSettingSearchEntries(): readonly TerminalFileLinkWorkspaceSearchEntry[] {
  const { title, description } = settingCopy()
  return [{ title, description, keywords: ['terminal', 'file', 'link', 'workspace', 'folder'] }]
}

export function registerTerminalFileLinkWorkspaceSetting(): void {
  registerTerminalFileLinkWorkspace({
    keepsCurrentWorkspace: () =>
      terminalFileLinksOpenInCurrentWorkspace(useAppStore.getState().settings),
    renderSetting: (settings, updateSettings) => (
      <TerminalFileLinkWorkspaceSetting settings={settings} updateSettings={updateSettings} />
    ),
    searchEntries: terminalFileLinkWorkspaceSettingSearchEntries
  })
}
