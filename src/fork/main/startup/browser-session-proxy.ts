import { shouldDeferBrowserSessionProxy } from '../../../shared/fork-hooks/startup'

const BROWSER_PROXY_FAILURE = '[proxy] Failed to apply network proxy settings to browser sessions'

/**
 * What startup awaits for the browser partitions' proxy write. Unregistered it is the write itself,
 * as upstream. Registered it resolves at once so the first window is not held. That keeps upstream's
 * guarantee: the write was started synchronously up to each partition's queued apply, which marks
 * the partition pending, and every partition request waits on that readiness
 * (BrowserCertificateRequestGuard), so nothing goes out before the proxy and a failed write cancels
 * requests. The failure is logged here because upstream's catch no longer sees it.
 */
export function deferStartupProxyWait(write: Promise<unknown>): Promise<unknown> {
  if (!shouldDeferBrowserSessionProxy()) {
    return write
  }
  write.catch(() => console.warn(BROWSER_PROXY_FAILURE))
  return Promise.resolve()
}
