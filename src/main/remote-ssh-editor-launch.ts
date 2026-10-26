import { getRemoteSshEditorKind } from '../shared/remote-ssh-editor-launcher'
import type { ShellOpenExternalEditorResult } from '../shared/shell-open-types'
import type { SshTarget } from '../shared/ssh-types'
import { getLauncherBaseName } from './editor-launcher-name'
import {
  resolveExternalEditorExecutable,
  type ExternalEditorLaunchSpec
} from './external-editor-launch'
import { resolveForkRemoteEditorLaunch } from '../shared/fork-hooks/remote-editor-launch'
import { resolveVsCodeSshAuthority } from './ssh/config/vscode-ssh-authority'
import { resolveZedSshUrl } from './ssh/config/zed-ssh-url'

export function resolveRemoteSshEditorLaunchSpec(
  command: string | undefined,
  pathValue: string,
  target: SshTarget,
  options: { platform?: NodeJS.Platform; fileExists?: (path: string) => boolean } = {}
):
  | { ok: true; launchSpec: ExternalEditorLaunchSpec }
  | Exclude<ShellOpenExternalEditorResult, { ok: true }> {
  const editorCommand = resolveExternalEditorExecutable(command, options)
  const editorKind = editorCommand ? getRemoteSshEditorKind(editorCommand) : null
  if (!editorCommand || !editorKind) {
    return { ok: false, reason: 'remote-editor-unsupported' }
  }
  let spawnArgs: string[]
  if (editorKind === 'zed') {
    const zedUrl = resolveZedSshUrl(target, pathValue)
    if (!zedUrl.ok) {
      return zedUrl
    }
    spawnArgs = [zedUrl.url]
  } else {
    const authority = resolveVsCodeSshAuthority(target)
    if (!authority.ok) {
      return authority
    }
    // fork: registered Cursor stays on the cursor:// URL. Unregistered keeps the CLI launch below.
    const forkUrl = resolveForkRemoteEditorLaunch(editorCommand, pathValue, authority.authority)
    if (forkUrl) {
      return { ok: true, launchSpec: forkUrl }
    }
    spawnArgs = ['--remote', `ssh-remote+${authority.authority}`, pathValue]
    // Cursor may reuse the last workbench; a new window preserves this workspace target.
    if (getLauncherBaseName(editorCommand) === 'cursor') {
      spawnArgs.unshift('--new-window')
    }
  }
  return {
    ok: true,
    launchSpec: { kind: 'executable', hideWindowsConsole: true, spawnCmd: editorCommand, spawnArgs }
  }
}
