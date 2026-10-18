import { EventEmitter } from 'node:events'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { MacUpdater } from 'electron-updater/out/MacUpdater'

// Why: the fork background download keeps install-on-quit on, so it relies on MacUpdater
// announcing the download before it asks Squirrel to stage. Every updater suite mocks this.
describe('electron-updater MacUpdater staging, install-on-quit on (fork)', () => {
  it('announces the download, then asks Squirrel to stage, when install-on-quit is on', async () => {
    const nativeUpdater = Object.assign(new EventEmitter(), {
      checkForUpdates: vi.fn(),
      setFeedURL: vi.fn()
    })
    const updater = {
      autoInstallOnAppQuit: true,
      squirrelDownloadedUpdate: false,
      nativeUpdater,
      server: null,
      _logger: { info: vi.fn(), warn: vi.fn() },
      debug: vi.fn(),
      dispatchUpdateDownloaded: vi.fn(),
      handleUpdateDownloaded: vi.fn(),
      closeServerIfExists(): void {
        MacUpdater.prototype['closeServerIfExists'].call(this)
      }
    }
    onTestFinished(() => updater.closeServerIfExists())

    const pending = MacUpdater.prototype['updateDownloaded'].call(
      updater,
      { info: { size: 1 }, url: new URL('https://example.invalid/Orca-arm64-mac.zip') },
      { downloadedFile: 'unread-because-size-is-known.zip' }
    )
    await vi.waitFor(() => expect(nativeUpdater.checkForUpdates).toHaveBeenCalledOnce())
    expect(updater.dispatchUpdateDownloaded).toHaveBeenCalledOnce()
    expect(updater.dispatchUpdateDownloaded.mock.invocationCallOrder[0]).toBeLessThan(
      nativeUpdater.checkForUpdates.mock.invocationCallOrder[0]
    )
    updater.closeServerIfExists()
    await Promise.race([
      pending.then(
        () => undefined,
        () => undefined
      ),
      Promise.resolve()
    ])
  })
})
