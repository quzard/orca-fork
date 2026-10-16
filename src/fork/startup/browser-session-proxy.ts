import { shouldDeferBrowserSessionProxy } from '../../shared/fork-hooks/startup'

const BROWSER_PROXY_FAILURE = '[proxy] Failed to apply network proxy settings to browser sessions'

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
