import { afterEach, describe, expect, it } from 'vitest'
import type { SshTarget } from '../../shared/ssh-types'
import { resolveRemoteSshEditorLaunchSpec } from '../../main/remote-ssh-editor-launch'
import { registerForkRemoteEditorLaunch } from '../../shared/fork-hooks/remote-editor-launch'
import { cursorRemoteSshLaunchSpec } from './cursor-remote-launch'
import {
  CURSOR_REMOTE_NEW_WINDOW_QUERY,
  buildCursorRemoteSshUrl,
  isCursorLauncherCommand
} from './cursor-remote-url'

const PROJECT_PATH = '/home/Ada Lovelace/project'
const CURSOR_URL =
  'cursor://vscode-remote/ssh-remote+builder/home/Ada%20Lovelace/project?windowId=_blank'
const BUILDER: SshTarget = {
  id: 'ssh-1',
  label: 'Builder',
  host: 'builder.example.com',
  port: 2222,
  username: 'ada',
  source: 'ssh-config',
  configHost: 'builder'
}

describe('cursor remote ssh url', () => {
  afterEach(() => {
    registerForkRemoteEditorLaunch(() => null)
  })

  it('encodes the workspace path; a plain authority stays as it is', () => {
    expect(buildCursorRemoteSshUrl('builder', PROJECT_PATH)).toBe(CURSOR_URL)
    expect(buildCursorRemoteSshUrl('ada@builder.local', '/srv')).toBe(
      'cursor://vscode-remote/ssh-remote+ada@builder.local/srv?windowId=_blank'
    )
    expect(CURSOR_REMOTE_NEW_WINDOW_QUERY).toBe('?windowId=_blank')
    expect(isCursorLauncherCommand('cursor')).toBe(true)
    expect(isCursorLauncherCommand('/usr/local/bin/cursor')).toBe(true)
    expect(isCursorLauncherCommand('"/home/user/My Apps/cursor"')).toBe(true)
    expect(isCursorLauncherCommand('cursor --wait')).toBe(false)
    expect(isCursorLauncherCommand('code')).toBe(false)
  })

  it('encodes an authority that would otherwise break the url', () => {
    const url = buildCursorRemoteSshUrl('ops box/2?x#y%', '/srv/app')
    expect(url).toBe(
      'cursor://vscode-remote/ssh-remote+ops%20box%2F2%3Fx%23y%25/srv/app?windowId=_blank'
    )
    const parsed = new URL(url)
    expect(parsed.search).toBe('?windowId=_blank')
    expect(parsed.hash).toBe('')
    expect(decodeURIComponent(parsed.pathname.split('/')[1]!)).toBe('ssh-remote+ops box/2?x#y%')
  })

  it('opens cursor through the url spec and still launches code as an executable', () => {
    // 未登记时跟上游：Cursor 走 CLI 的 --remote。登记后才换成 cursor://。
    expect(resolveRemoteSshEditorLaunchSpec('cursor', PROJECT_PATH, BUILDER)).toMatchObject({
      ok: true,
      launchSpec: {
        kind: 'executable',
        spawnArgs: ['--new-window', '--remote', 'ssh-remote+builder', PROJECT_PATH]
      }
    })
    registerForkRemoteEditorLaunch(cursorRemoteSshLaunchSpec)
    expect(resolveRemoteSshEditorLaunchSpec('cursor', PROJECT_PATH, BUILDER)).toEqual({
      ok: true,
      launchSpec: { kind: 'url', url: CURSOR_URL }
    })
    expect(resolveRemoteSshEditorLaunchSpec('code', PROJECT_PATH, BUILDER)).toMatchObject({
      ok: true,
      launchSpec: {
        kind: 'executable',
        spawnArgs: ['--remote', 'ssh-remote+builder', PROJECT_PATH]
      }
    })
  })
})
