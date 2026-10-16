import type { ForkRemoteEditorUrlSpec } from '../../shared/fork-hooks/remote-editor-launch'
import { buildCursorRemoteSshUrl, isCursorLauncherCommand } from './cursor-remote-url'

export function cursorRemoteSshLaunchSpec(
  command: string | undefined,
  pathValue: string,
  authority: string
): ForkRemoteEditorUrlSpec | null {
  if (!isCursorLauncherCommand(command) || !authority.trim() || !pathValue.trim()) {
    return null
  }
  return { kind: 'url', url: buildCursorRemoteSshUrl(authority, pathValue) }
}
