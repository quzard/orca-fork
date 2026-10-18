// fork: SSH connection status names are translated. Upstream's literal stays the English fallback.
import { translate } from '../../renderer/src/i18n/i18n'

const KEY_BY_STATUS: Readonly<Record<string, string>> = {
  disconnected: 'disconnected',
  connecting: 'connecting',
  'auth-failed': 'authFailed',
  'deploying-relay': 'deployingRelay',
  connected: 'connected',
  reconnecting: 'reconnecting',
  'reconnection-failed': 'reconnectionFailed'
}

/**
 * Turns each plain status label into a getter that translates on read, so a language switch shows
 * at once. Labels that are already getters (upstream's `error`) are left alone.
 */
export function withForkSshStatusLabels<T extends Record<string, string>>(labels: T): T {
  for (const [status, key] of Object.entries(KEY_BY_STATUS)) {
    const descriptor = Object.getOwnPropertyDescriptor(labels, status)
    if (typeof descriptor?.value !== 'string') {
      continue
    }
    const english = descriptor.value
    Object.defineProperty(labels, status, {
      get: () => translate(`sshConnectionStatus.${key}`, english),
      enumerable: true,
      configurable: true
    })
  }
  return labels
}
