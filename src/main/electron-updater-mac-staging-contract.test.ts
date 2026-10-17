import { EventEmitter } from 'node:events'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { MacUpdater } from 'electron-updater/out/MacUpdater'

// Why: supervised serve installs rely on these MacUpdater behaviors, which every updater suite mocks;
// an electron-updater upgrade that changed them would silently bring back the macOS serve deadlock.
describe('electron-updater MacUpdater staging contract', () => {
  it('stages Squirrel from quitAndInstall, not from the finished download, when autoInstallOnAppQuit is off', async () => {
    const nativeUpdater = Object.assign(new EventEmitter(), {
      checkForUpdates: vi.fn(),
      setFeedURL: vi.fn()
    })
    const updater = {
      autoInstallOnAppQuit: false,
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

    // Why: a regression that stages here never settles the await, so cleanup must not depend on the body finishing.
    onTestFinished(() => updater.closeServerIfExists())

    await MacUpdater.prototype['updateDownloaded'].call(
      updater,
      { info: { size: 1 }, url: new URL('https://example.invalid/Orca-arm64-mac.zip') },
      { downloadedFile: 'unread-because-size-is-known.zip' }
    )
    expect(updater.dispatchUpdateDownloaded).toHaveBeenCalledOnce()
    expect(nativeUpdater.checkForUpdates).not.toHaveBeenCalled()

    MacUpdater.prototype.quitAndInstall.call(updater)

    expect(nativeUpdater.checkForUpdates).toHaveBeenCalledOnce()
    expect(updater.handleUpdateDownloaded).not.toHaveBeenCalled()
    nativeUpdater.emit('update-downloaded')
    expect(updater.handleUpdateDownloaded).toHaveBeenCalledOnce()
  })

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

  it('quits the app without relaunching once staged when autoRunAppAfterInstall is off', () => {
    const app = { quit: vi.fn() }
    const nativeUpdater = { quitAndInstall: vi.fn() }

    MacUpdater.prototype['handleUpdateDownloaded'].call({
      autoRunAppAfterInstall: false,
      app,
      nativeUpdater,
      closeServerIfExists: vi.fn()
    })

    expect(app.quit).toHaveBeenCalledOnce()
    expect(nativeUpdater.quitAndInstall).not.toHaveBeenCalled()
  })
})
