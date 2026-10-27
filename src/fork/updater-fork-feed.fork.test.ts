import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from '../main/updater-test-module-loader'

const {
  appMock,
  autoUpdaterMock,
  fetchChangelogMock,
  fetchNewerReleaseTagsMock,
  moduleFactories,
  resetUpdaterMocks
} = await vi.hoisted(async () =>
  (await import('../main/updater-test-harness')).createUpdaterMocks()
)

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('../main/electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('../main/ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('../main/linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('../main/updater-lifecycle-diagnostics', () =>
  moduleFactories.updaterLifecycleDiagnostics()
)
vi.mock('../main/updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('../main/updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('../main/update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('../main/updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('../main/local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('../main/local-builds/local-build-feed-server', () =>
  moduleFactories.localBuildFeedServer()
)

warmUpdaterModule()

const UPSTREAM_RELEASE_URL = /stablyai|onorca/i

function feedUrls(): string[] {
  return autoUpdaterMock.setFeedURL.mock.calls.map((call: unknown[]) => JSON.stringify(call[0]))
}

async function loadForkUpdater(withFeed: boolean) {
  const updater = await loadUpdaterModule()
  // resetUpdaterMocks 会 resetModules，钩子要从同一份模块图里登记。
  const hook = await import('../shared/fork-hooks/update-feed')
  hook.registerForkBuild()
  hook.registerForkUpdateFeed(withFeed)
  return updater
}

describe('fork desktop updater never pins a stablyai release feed', () => {
  beforeEach(() => {
    resetUpdaterMocks()
  })

  it('setup and a menu check pin only the anonymous quzard/orca-fork feed', async () => {
    appMock.getVersion.mockReturnValue('1.4.228-local.1792251680994.aaaaaaaaaaaa')
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined)
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadForkUpdater(true)

    setupAutoUpdater(
      { isDestroyed: () => false, webContents: { send: vi.fn(), isDestroyed: () => false } } as never,
      {
        getLastUpdateCheckAt: () => Date.now()
      }
    )
    expect(feedUrls().some((url) => UPSTREAM_RELEASE_URL.test(url))).toBe(false)

    checkForUpdatesFromMenu()
    await vi.waitFor(() => {
      expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    })
    expect(autoUpdaterMock.setFeedURL).toHaveBeenLastCalledWith({
      provider: 'github',
      owner: 'quzard',
      repo: 'orca-fork',
      private: false
    })
    expect(feedUrls().some((url) => UPSTREAM_RELEASE_URL.test(url))).toBe(false)
    expect(feedUrls().join('\n')).not.toMatch(/token/i)
    expect(fetchNewerReleaseTagsMock).not.toHaveBeenCalled()
    expect(fetchChangelogMock.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it('a fork build without the desktop feed never checks and never pins upstream', async () => {
    appMock.getVersion.mockReturnValue('1.4.228-local.1792251680994.aaaaaaaaaaaa')
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined)
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadForkUpdater(false)

    setupAutoUpdater(
      { isDestroyed: () => false, webContents: { send: vi.fn(), isDestroyed: () => false } } as never,
      {
        getLastUpdateCheckAt: () => 0
      }
    )
    checkForUpdatesFromMenu()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(feedUrls()).toEqual([])
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(fetchNewerReleaseTagsMock).not.toHaveBeenCalled()
  })
})
