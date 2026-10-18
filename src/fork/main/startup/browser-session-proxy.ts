import { shouldDeferBrowserSessionProxy } from '../../../shared/fork-hooks/startup'

const BROWSER_PROXY_FAILURE = '[proxy] Failed to apply network proxy settings to browser sessions'

/**
 * Starts the startup proxy write for browser partitions. Registered builds return without waiting
 * so the first window is not held. That keeps upstream's guarantee: `apply` runs synchronously up
 * to each partition's queued write, which marks the partition pending, and every partition request
 * waits on that readiness (BrowserCertificateRequestGuard), so nothing goes out before the proxy
 * and a failed write cancels requests. Unregistered builds still wait, as upstream does.
 */
export async function applyStartupBrowserSessionProxies(
  apply: () => Promise<unknown>
): Promise<void> {
  const pending = apply().then(
    () => undefined,
    () => {
      console.warn(BROWSER_PROXY_FAILURE)
    }
  )
  if (shouldDeferBrowserSessionProxy()) {
    return
  }
  await pending
}
