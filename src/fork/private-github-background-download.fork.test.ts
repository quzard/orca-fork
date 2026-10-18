import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '../shared/update-status-types'
import type { registerAutoUpdaterHandlers } from '../main/updater-events'
import { beginMacUpdateDownload } from '../main/updater-mac-install'

const nativeAutoUpdater = vi.hoisted(() => {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>()
  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
      return this
    },
    emit(event: string, ...args: unknown[]) {
      const list = handlers.get(event) ?? []
      for (const handler of list) {
        handler(...args)
      }
    },
    removeAllListeners(): void {
      handlers.clear()
    }
  }
})

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '1.0.0',
    on: vi.fn(),
    prependListener: vi.fn(),
    quit: vi.fn()
  },
  autoUpdater: nativeAutoUpdater
}))

vi.mock('../main/linux-update-package-type', () => ({
  getLinuxPackageType: () => 'non-root',
  getLinuxRootPackageType: () => null,
  isExternallyManagedLinuxInstall: () => false
}))

vi.mock('../main/cli/appimage-copy-pre-extraction', () => ({
  preExtractDownloadedAppImageUpdate: vi.fn(async () => false)
}))

vi.mock('../main/updater-changelog', () => ({
  fetchChangelog: vi.fn(async () => null)
}))

vi.mock('../main/updater-lifecycle-diagnostics', () => ({
  recordUpdaterLifecycle: vi.fn()
}))
import {
  FORK_GITHUB_UPDATE_OWNER,
  FORK_GITHUB_UPDATE_REPO,
  registerForkUpdateFeed
} from '../shared/fork-hooks/update-feed'
import {
  FORK_BACKGROUND_CHECK_FAILURE_LOG,
  FORK_BACKGROUND_DOWNLOAD_FAILURE_LOG,
  armForkBackgroundDownload,
  consumeForkBackgroundDownloadFailure,
  forkAutoInstallOnQuit,
  forkStagedUpdateVersion,
  noteForkUpdateDownloaded,
  planForkCheckFailure,
  planForkFoundUpdate,
  planForkMissingUpdate,
  resetForkBackgroundDownloadState,
  shouldHoldForkUpdateCheck,
  shouldPreserveForkDownloadedContext
} from './private-github-background-download'

const TOKEN = 'super-secret-token'
const hostPlatform = process.platform

function usePlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
}

function useReadyFeed(): void {
  registerForkUpdateFeed(() => ({
    provider: 'github',
    owner: FORK_GITHUB_UPDATE_OWNER,
    repo: FORK_GITHUB_UPDATE_REPO,
    private: true,
    token: TOKEN
  }))
}

afterEach(() => {
  registerForkUpdateFeed(null)
  resetForkBackgroundDownloadState()
  usePlatform(hostPlatform)
  nativeAutoUpdater.removeAllListeners()
  beginMacUpdateDownload()
})

describe('fork background download decisions', () => {
  it('leaves install-on-quit unchanged without a private feed', () => {
    expect(
      forkAutoInstallOnQuit({
        forkReady: false,
        interactive: true,
        linuxNonRootImplicitQuit: false,
        platform: 'darwin'
      })
    ).toBe(false)
    expect(
      forkAutoInstallOnQuit({
        forkReady: false,
        interactive: true,
        linuxNonRootImplicitQuit: true,
        platform: 'linux'
      })
    ).toBe(true)
    expect(
      forkAutoInstallOnQuit({
        forkReady: false,
        interactive: true,
        linuxNonRootImplicitQuit: false,
        platform: 'linux'
      })
    ).toBe(false)
    expect(
      forkAutoInstallOnQuit({
        forkReady: false,
        interactive: false,
        linuxNonRootImplicitQuit: true,
        platform: 'linux'
      })
    ).toBe(false)
  })

  it('installs on quit for an interactive private-feed session, except supervised and Linux packages', () => {
    expect(
      forkAutoInstallOnQuit({
        forkReady: true,
        interactive: true,
        linuxNonRootImplicitQuit: false,
        platform: 'darwin'
      })
    ).toBe(true)
    expect(
      forkAutoInstallOnQuit({
        forkReady: true,
        interactive: true,
        linuxNonRootImplicitQuit: false,
        platform: 'win32'
      })
    ).toBe(true)
    expect(
      forkAutoInstallOnQuit({
        forkReady: true,
        interactive: false,
        linuxNonRootImplicitQuit: false,
        platform: 'darwin'
      })
    ).toBe(false)
    expect(
      forkAutoInstallOnQuit({
        forkReady: true,
        interactive: true,
        linuxNonRootImplicitQuit: false,
        platform: 'linux'
      })
    ).toBe(false)
    expect(
      forkAutoInstallOnQuit({
        forkReady: true,
        interactive: true,
        linuxNonRootImplicitQuit: true,
        platform: 'linux'
      })
    ).toBe(true)
  })

  it('downloads a new version once, then does not prompt again for that same version', () => {
    useReadyFeed()
    expect(
      planForkFoundUpdate({
        localOrPinned: false,
        version: '2.0.0',
        userInitiated: false,
        downloadingVersion: null
      })
    ).toBe('download')
    expect(
      planForkFoundUpdate({
        localOrPinned: false,
        version: '2.0.0',
        userInitiated: false,
        downloadingVersion: '2.0.0'
      })
    ).toBe('keep')
    expect(
      planForkFoundUpdate({
        localOrPinned: false,
        version: '3.0.0',
        userInitiated: false,
        downloadingVersion: '2.0.0'
      })
    ).toBe('keep')

    armForkBackgroundDownload('2.0.0')
    expect(
      planForkFoundUpdate({
        localOrPinned: false,
        version: '3.0.0',
        userInitiated: true,
        downloadingVersion: null
      })
    ).toBe('keep')
    expect(shouldPreserveForkDownloadedContext(false)).toBe(true)
    resetForkBackgroundDownloadState()
    useReadyFeed()

    noteForkUpdateDownloaded('2.0.0', false)
    expect(forkStagedUpdateVersion()).toBe('2.0.0')
    expect(
      shouldHoldForkUpdateCheck({
        userInitiated: false,
        status: 'downloaded',
        localOrPinned: false
      })
    ).toBe(true)
    expect(
      planForkFoundUpdate({
        localOrPinned: false,
        version: '2.0.0',
        userInitiated: false,
        downloadingVersion: null
      })
    ).toBe('keep')
    expect(planForkMissingUpdate(false)).toBe('keep')
    expect(planForkCheckFailure('downloaded', false)).toEqual({ kind: 'keep', version: '2.0.0' })

    expect(
      shouldHoldForkUpdateCheck({
        userInitiated: true,
        status: 'downloaded',
        localOrPinned: false
      })
    ).toBe(false)
    expect(shouldPreserveForkDownloadedContext(false)).toBe(true)
    expect(
      planForkFoundUpdate({
        localOrPinned: false,
        version: '2.0.0',
        userInitiated: true,
        downloadingVersion: null
      })
    ).toBe('restart')
    expect(planForkMissingUpdate(true)).toBe('restart')
    expect(planForkCheckFailure('checking', true)).toEqual({ kind: 'restart', version: '2.0.0' })

    expect(
      planForkFoundUpdate({
        localOrPinned: false,
        version: '3.0.0',
        userInitiated: false,
        downloadingVersion: null
      })
    ).toBe('download')
  })

  it('does not change update offers when no fork feed is registered', () => {
    expect(
      planForkFoundUpdate({
        localOrPinned: false,
        version: '2.0.0',
        userInitiated: false,
        downloadingVersion: null
      })
    ).toBe('passthrough')
    expect(planForkMissingUpdate(false)).toBe('passthrough')
    expect(
      shouldHoldForkUpdateCheck({
        userInitiated: false,
        status: 'downloaded',
        localOrPinned: false
      })
    ).toBe(false)
    expect(shouldPreserveForkDownloadedContext(false)).toBe(false)
    expect(planForkCheckFailure('downloaded', false)).toEqual({ kind: 'none' })

    useReadyFeed()
    expect(
      planForkFoundUpdate({
        localOrPinned: true,
        version: '2.0.0',
        userInitiated: false,
        downloadingVersion: null
      })
    ).toBe('passthrough')
  })

  it('does not swallow local-build or pinned-version check errors', () => {
    useReadyFeed()
    noteForkUpdateDownloaded('2.0.0', false)
    expect(planForkCheckFailure('checking', true, { localBuild: true })).toEqual({ kind: 'none' })
    expect(planForkCheckFailure('downloaded', false, { pinned: true })).toEqual({ kind: 'none' })
    expect(planForkCheckFailure('error', true, { localBuild: true, pinned: true })).toEqual({
      kind: 'none'
    })
    expect(planForkCheckFailure('checking', true)).toEqual({ kind: 'restart', version: '2.0.0' })
  })

  it('logs a fixed download-failure line and falls back to the manual offer', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    armForkBackgroundDownload('2.0.0')
    expect(consumeForkBackgroundDownloadFailure('2.0.0')).toEqual({
      state: 'available',
      version: '2.0.0',
      changelog: null
    })
    expect(consumeForkBackgroundDownloadFailure('2.0.0')).toBeNull()
    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(FORK_BACKGROUND_DOWNLOAD_FAILURE_LOG)
    expect(JSON.stringify(info.mock.calls)).not.toContain(TOKEN)
    expect(FORK_BACKGROUND_DOWNLOAD_FAILURE_LOG).not.toMatch(/authorization|token/i)
    expect(FORK_BACKGROUND_CHECK_FAILURE_LOG).not.toMatch(/authorization|token/i)
    info.mockRestore()
  })
})

type HandlerContext = Parameters<typeof registerAutoUpdaterHandlers>[0]

function testAutoUpdater(): {
  autoUpdater: HandlerContext['autoUpdater']
  emit: (event: string, ...args: unknown[]) => void
} {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>()
  const autoUpdater = {
    on(event: string, handler: (...args: unknown[]) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
      return autoUpdater
    }
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: tests only emit the updater events registered below; other ElectronAutoUpdater methods are unused.
    autoUpdater: autoUpdater as HandlerContext['autoUpdater'],
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) {
        handler(...args)
      }
    }
  }
}

describe('fork updater handler wiring', () => {
  async function wireHandlers(): Promise<{
    emit: (event: string, ...args: unknown[]) => void
    sent: UpdateStatus[]
    sendStatus: ReturnType<typeof vi.fn>
    beginForkBackgroundDownload: ReturnType<typeof vi.fn>
    finishActiveUpdateCheckAttempt: ReturnType<typeof vi.fn>
    setStatus: (next: UpdateStatus) => void
    setUserInitiated: (value: boolean) => void
  }> {
    let status: UpdateStatus = { state: 'idle' }
    let userInitiated = false
    const sent: UpdateStatus[] = []
    const sendStatus = vi.fn((next: UpdateStatus) => {
      status = next
      sent.push(next)
    })
    const beginForkBackgroundDownload = vi.fn()
    const finishActiveUpdateCheckAttempt = vi.fn()
    const { autoUpdater, emit } = testAutoUpdater()
    const context: HandlerContext = {
      autoUpdater,
      clearBackgroundCheckLaunchPending: vi.fn(),
      clearAvailableUpdateContext: vi.fn(),
      consumeMissingManifestPrereleaseFallbackResult: vi.fn(() => null),
      getPublishingWindowLastGoodCheck: vi.fn(() => null),
      getMissingManifestPrereleaseFallbackUserInitiated: vi.fn(() => null),
      getCurrentStatus: () => status,
      getActiveUpdateCheckEventAttemptId: vi.fn(() => 1),
      getKnownReleaseUrl: vi.fn(() => undefined),
      getPendingInstallVersion: () => (status.state === 'downloading' ? status.version : '2.0.0'),
      getUserInitiatedCheck: () => userInitiated,
      handleQuitAndInstallFailure: vi.fn(() => false),
      isQuitAndInstallHandoffActive: vi.fn(() => false),
      hasInstallableDownloadedVersion: vi.fn(() => true),
      isLocalBuildCheck: vi.fn(() => false),
      isPinnedBuildCheck: vi.fn(() => false),
      shouldHandleUpdaterErrorEvent: vi.fn(() => true),
      clearUpdateAvailableEventPending: vi.fn(),
      isActiveUpdateCheckAttempt: vi.fn(() => true),
      markUpdateCheckEventAttempt: vi.fn(() => true),
      markUpdateAvailableEventPending: vi.fn(),
      markMissingManifestPrereleaseFallbackChecking: vi.fn(),
      performQuitAndInstall: vi.fn(),
      commitStagedMacInstall: vi.fn(),
      failMacStaging: vi.fn(),
      isAwaitingMacStaging: vi.fn(() => false),
      isMacStagingDeferredToInstall: vi.fn(() => false),
      shouldDeferMacQuitForInstall: vi.fn(() => true),
      recordCompletedUpdateCheck: vi.fn(),
      restoreReleaseUpdateSource: vi.fn(),
      sendCheckFailureStatus: vi.fn(),
      sendErrorStatus: vi.fn(),
      sendStatus,
      scheduleAutomaticUpdateCheck: vi.fn(),
      shouldSuppressMissingManifestPrereleaseFallbackEvent: vi.fn(() => false),
      suppressMissingManifestPrereleaseFallbackPromiseFailure: vi.fn(),
      setAvailableReleaseUrl: vi.fn(),
      setAvailableVersion: vi.fn(),
      setUserInitiatedCheck: vi.fn(),
      beginForkBackgroundDownload,
      finishActiveUpdateCheckAttempt
    }
    const { registerAutoUpdaterHandlers } = await import('../main/updater-events')
    registerAutoUpdaterHandlers(context)
    return {
      emit,
      sent,
      sendStatus,
      beginForkBackgroundDownload,
      finishActiveUpdateCheckAttempt,
      setStatus: (next) => {
        status = next
      },
      setUserInitiated: (value) => {
        userInitiated = value
      }
    }
  }

  it('on linux, shows the restart card once when the download finishes', async () => {
    usePlatform('linux')
    useReadyFeed()
    const {
      emit,
      sent,
      sendStatus,
      beginForkBackgroundDownload,
      finishActiveUpdateCheckAttempt,
      setStatus,
      setUserInitiated
    } = await wireHandlers()

    emit('checking-for-update')
    emit('update-available', { version: '2.0.0' })
    expect(beginForkBackgroundDownload).toHaveBeenCalledExactlyOnceWith('2.0.0')
    expect(sent.some((item) => item.state === 'available')).toBe(false)
    expect(sent.some((item) => item.state === 'checking')).toBe(true)

    setStatus({ state: 'downloading', percent: 40, version: '2.0.0' })
    emit('update-downloaded', { version: '2.0.0', downloadedFile: '/tmp/Orca.zip' })
    expect(sent.at(-1)).toMatchObject({ state: 'downloaded', version: '2.0.0' })
    expect(forkStagedUpdateVersion()).toBe('2.0.0')

    sendStatus.mockClear()
    beginForkBackgroundDownload.mockClear()
    setStatus({ state: 'downloaded', version: '2.0.0' })
    emit('checking-for-update')
    emit('update-available', { version: '2.0.0' })
    expect(sendStatus).not.toHaveBeenCalled()
    expect(beginForkBackgroundDownload).not.toHaveBeenCalled()
    expect(finishActiveUpdateCheckAttempt).toHaveBeenCalled()

    setUserInitiated(true)
    sendStatus.mockClear()
    emit('checking-for-update')
    emit('update-available', { version: '2.0.0' })
    expect(sent.map((item) => item.state)).toEqual([
      'checking',
      'downloaded',
      'checking',
      'downloaded'
    ])
    expect(beginForkBackgroundDownload).not.toHaveBeenCalled()

    setUserInitiated(false)
    setStatus({ state: 'downloaded', version: '2.0.0' })
    beginForkBackgroundDownload.mockClear()
    emit('checking-for-update')
    emit('update-available', { version: '3.0.0' })
    expect(beginForkBackgroundDownload).toHaveBeenCalledExactlyOnceWith('3.0.0')
  })

  it('on darwin, shows the restart card once after Squirrel stages', async () => {
    usePlatform('darwin')
    useReadyFeed()
    beginMacUpdateDownload()
    const { emit, sent, sendStatus, beginForkBackgroundDownload, setStatus, setUserInitiated } =
      await wireHandlers()

    emit('checking-for-update')
    emit('update-available', { version: '2.0.0' })
    expect(beginForkBackgroundDownload).toHaveBeenCalledExactlyOnceWith('2.0.0')
    expect(sent.some((item) => item.state === 'available')).toBe(false)

    setStatus({ state: 'downloading', percent: 40, version: '2.0.0' })
    emit('update-downloaded', { version: '2.0.0', downloadedFile: '/tmp/Orca.zip' })
    expect(sent.at(-1)).toMatchObject({ state: 'downloading', percent: 100, version: '2.0.0' })
    expect(sent.some((item) => item.state === 'downloaded')).toBe(false)
    expect(forkStagedUpdateVersion()).toBe('2.0.0')

    sendStatus.mockClear()
    beginForkBackgroundDownload.mockClear()
    emit('checking-for-update')
    emit('update-available', { version: '2.0.0' })
    expect(sendStatus).not.toHaveBeenCalled()
    expect(beginForkBackgroundDownload).not.toHaveBeenCalled()

    nativeAutoUpdater.emit('update-downloaded')
    expect(sent.filter((item) => item.state === 'downloaded')).toEqual([
      expect.objectContaining({ state: 'downloaded', version: '2.0.0' })
    ])

    sendStatus.mockClear()
    emit('checking-for-update')
    emit('update-available', { version: '2.0.0' })
    expect(sendStatus).not.toHaveBeenCalled()

    setUserInitiated(true)
    sendStatus.mockClear()
    emit('checking-for-update')
    emit('update-available', { version: '2.0.0' })
    expect(sent.slice(-2).map((item) => item.state)).toEqual(['checking', 'downloaded'])
    expect(sent.filter((item) => item.state === 'downloaded')).toHaveLength(2)
  })

  it('keeps the manual offer when no private feed is registered', async () => {
    registerForkUpdateFeed(null)
    resetForkBackgroundDownloadState()
    let status: UpdateStatus = { state: 'checking' }
    const sendStatus = vi.fn()
    const beginForkBackgroundDownload = vi.fn()
    const { autoUpdater, emit } = testAutoUpdater()
    const { registerAutoUpdaterHandlers } = await import('../main/updater-events')
    registerAutoUpdaterHandlers({
      autoUpdater,
      clearBackgroundCheckLaunchPending: vi.fn(),
      clearAvailableUpdateContext: vi.fn(),
      consumeMissingManifestPrereleaseFallbackResult: vi.fn(() => null),
      getPublishingWindowLastGoodCheck: vi.fn(() => null),
      getMissingManifestPrereleaseFallbackUserInitiated: vi.fn(() => null),
      getCurrentStatus: () => status,
      getActiveUpdateCheckEventAttemptId: vi.fn(() => 1),
      getKnownReleaseUrl: vi.fn(() => undefined),
      getPendingInstallVersion: () => '',
      getUserInitiatedCheck: () => false,
      handleQuitAndInstallFailure: vi.fn(() => false),
      isQuitAndInstallHandoffActive: vi.fn(() => false),
      hasInstallableDownloadedVersion: vi.fn(() => false),
      isLocalBuildCheck: vi.fn(() => false),
      isPinnedBuildCheck: vi.fn(() => false),
      shouldHandleUpdaterErrorEvent: vi.fn(() => true),
      clearUpdateAvailableEventPending: vi.fn(),
      isActiveUpdateCheckAttempt: vi.fn(() => true),
      markUpdateCheckEventAttempt: vi.fn(() => true),
      markUpdateAvailableEventPending: vi.fn(),
      markMissingManifestPrereleaseFallbackChecking: vi.fn(),
      performQuitAndInstall: vi.fn(),
      commitStagedMacInstall: vi.fn(),
      failMacStaging: vi.fn(),
      isAwaitingMacStaging: vi.fn(() => false),
      isMacStagingDeferredToInstall: vi.fn(() => false),
      shouldDeferMacQuitForInstall: vi.fn(() => true),
      recordCompletedUpdateCheck: vi.fn(),
      restoreReleaseUpdateSource: vi.fn(),
      sendCheckFailureStatus: vi.fn(),
      sendErrorStatus: vi.fn(),
      sendStatus,
      scheduleAutomaticUpdateCheck: vi.fn(),
      shouldSuppressMissingManifestPrereleaseFallbackEvent: vi.fn(() => false),
      suppressMissingManifestPrereleaseFallbackPromiseFailure: vi.fn(),
      setAvailableReleaseUrl: vi.fn(),
      setAvailableVersion: vi.fn(),
      setUserInitiatedCheck: vi.fn()
    })
    emit('update-available', { version: '2.0.0' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(beginForkBackgroundDownload).not.toHaveBeenCalled()
    expect(sendStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'available', version: '2.0.0', changelog: null })
    )
  })
})
