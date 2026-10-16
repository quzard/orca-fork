export const CURSOR_LAUNCHER_NAME = 'cursor'
export const CURSOR_REMOTE_SSH_LAUNCHER_ID = 'cursor-remote-ssh'
export const CURSOR_OPEN_IN_LABEL = 'Cursor'
export const CURSOR_REMOTE_SSH_URL_PREFIX = 'cursor://vscode-remote/ssh-remote+'
export const CURSOR_REMOTE_NEW_WINDOW_QUERY = '?windowId=_blank'

const WINDOWS_ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\)/i

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed[0]
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function launcherBaseName(command: string): string {
  const unquoted = stripMatchingQuotes(command)
  const fileName = unquoted.split(/[\\/]/).at(-1) ?? ''
  return fileName.replace(/\.(?:cmd|exe|bat)$/i, '').toLowerCase()
}

/** Cursor itself, or an absolute path whose file name is `cursor`. */
export function isCursorLauncherCommand(command: string | undefined): boolean {
  const trimmed = command?.trim() ?? ''
  if (!trimmed) {
    return false
  }
  const unquoted = stripMatchingQuotes(trimmed)
  if (/\s/.test(unquoted)) {
    const absolute = unquoted.startsWith('/') || WINDOWS_ABSOLUTE_PATH.test(unquoted)
    return absolute && launcherBaseName(unquoted) === CURSOR_LAUNCHER_NAME
  }
  return launcherBaseName(unquoted) === CURSOR_LAUNCHER_NAME
}

/** `cursor://vscode-remote/ssh-remote+<authority><path>?windowId=_blank` */
export function buildCursorRemoteSshUrl(authority: string, pathValue: string): string {
  const encodedPath = pathValue.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
  return `${CURSOR_REMOTE_SSH_URL_PREFIX}${authority}${encodedPath}${CURSOR_REMOTE_NEW_WINDOW_QUERY}`
}
