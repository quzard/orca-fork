// The fork lets the first window open before browser partitions finish taking the proxy. That is
// only safe because upstream holds every partition request until the newest proxy write settles
// (BrowserCertificateRequestGuard reads getProxySessionApplicationReadiness). These tests pin that.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyProxySettingsToSession,
  getProxySessionApplicationReadiness,
  resetSessionProxyApplicationForTests
} from '../../../main/network/proxy-settings'
import {
  registerDeferBrowserSessionProxy,
  resetStartupForkHooksForTests
} from '../../../shared/fork-hooks/startup'
import { deferStartupProxyWait } from './browser-session-proxy'

function slowSession() {
  let finish: ((error?: Error) => void) | undefined
  const proxySession = {
    resolveProxy: vi.fn(async () => 'DIRECT'),
    setProxy: vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          finish = (error) => (error ? reject(error) : resolve())
        })
    ),
    closeAllConnections: vi.fn(async () => {}),
    webRequest: { onBeforeRequest: vi.fn() }
  }
  resetSessionProxyApplicationForTests(proxySession)
  return { proxySession, finish: (error?: Error) => finish?.(error) }
}

const settings = { httpProxyUrl: 'http://proxy.example:8080' }

afterEach(() => resetStartupForkHooksForTests())

describe('startup browser partition proxy', () => {
  it('registered: returns at once, and partition requests wait for the proxy', async () => {
    registerDeferBrowserSessionProxy(true)
    const { proxySession, finish } = slowSession()
    await deferStartupProxyWait(applyProxySettingsToSession(proxySession, settings, { env: {} }))
    // The write started before the first window: a request now is held, not sent direct.
    const readiness = getProxySessionApplicationReadiness(proxySession)
    expect(readiness).toBeInstanceOf(Promise)
    await vi.waitFor(() => expect(proxySession.setProxy).toHaveBeenCalledOnce())
    finish()
    await expect(readiness).resolves.toBe(true)
  })

  it('registered: a failed write cancels partition requests instead of letting them go direct', async () => {
    registerDeferBrowserSessionProxy(true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { proxySession, finish } = slowSession()
    proxySession.setProxy.mockRejectedValue(new Error('proxy write failed'))
    await deferStartupProxyWait(applyProxySettingsToSession(proxySession, settings, { env: {} }))
    finish()
    await expect(getProxySessionApplicationReadiness(proxySession)).resolves.toBe(false)
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })

  it('unregistered: waits for the proxy, as upstream does', async () => {
    const { proxySession, finish } = slowSession()
    let settled = false
    const startup = deferStartupProxyWait(
      applyProxySettingsToSession(proxySession, settings, { env: {} })
    ).then(() => (settled = true))
    await vi.waitFor(() => expect(proxySession.setProxy).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    finish()
    await startup
    expect(settled).toBe(true)
  })
})
