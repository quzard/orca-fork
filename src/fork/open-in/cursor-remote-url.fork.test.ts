import { describe, expect, it } from 'vitest'
import { resolveVsCodeRemoteSshLaunchSpec } from '../../main/external-editor-launch'
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

describe('cursor remote ssh url', () => {
  it('encodes the workspace path and leaves the ssh authority raw', () => {
    expect(buildCursorRemoteSshUrl('builder', PROJECT_PATH)).toBe(CURSOR_URL)
    expect(CURSOR_REMOTE_NEW_WINDOW_QUERY).toBe('?windowId=_blank')
    expect(isCursorLauncherCommand('cursor')).toBe(true)
    expect(isCursorLauncherCommand('/usr/local/bin/cursor')).toBe(true)
    expect(isCursorLauncherCommand('"/home/user/My Apps/cursor"')).toBe(true)
    expect(isCursorLauncherCommand('cursor --wait')).toBe(false)
    expect(isCursorLauncherCommand('code')).toBe(false)
  })

  it('opens cursor through the url spec and still launches code as an executable', () => {
    expect(resolveVsCodeRemoteSshLaunchSpec('cursor', PROJECT_PATH, 'builder')).toBeNull()
    registerForkRemoteEditorLaunch(cursorRemoteSshLaunchSpec)
    expect(resolveVsCodeRemoteSshLaunchSpec('cursor', PROJECT_PATH, 'builder')).toEqual({
      kind: 'url',
      url: CURSOR_URL
    })
    expect(resolveVsCodeRemoteSshLaunchSpec('code', PROJECT_PATH, 'builder')).toMatchObject({
      kind: 'executable',
      spawnArgs: ['--remote', 'ssh-remote+builder', PROJECT_PATH]
    })
  })
})
