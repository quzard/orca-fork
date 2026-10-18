// fork: SSH connection status names are translated. Upstream's literal stays the English fallback.
import { forkTranslate } from '../i18n/fork-translate'
import { SSH_STATUS_KEYS } from './ssh-status-keys'

/**
 * Turns each plain status label into a getter that translates on read, so a language switch shows
 * at once. Labels that are already getters (upstream's `error`) are left alone.
 */
export function withForkSshStatusLabels<T extends Record<string, string>>(labels: T): T {
  for (const [status, key] of Object.entries(SSH_STATUS_KEYS)) {
    const descriptor = Object.getOwnPropertyDescriptor(labels, status)
    if (typeof descriptor?.value !== 'string') {
      continue
    }
    const english = descriptor.value
    Object.defineProperty(labels, status, {
      get: () => forkTranslate(key, english),
      enumerable: true,
      configurable: true
    })
  }
  return labels
}
