import {
  beginMacUpdateDownload,
  deferMacQuitUntilInstallerReady,
  isMacInstallRequested,
  setMacInstallPreflightInProgress
} from '../updater-mac-install'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'
import { isExternallyManagedLinuxInstall } from '../linux-update-package-type'
import { LINUX_PACKAGE_EXTERNALLY_MANAGED_MESSAGE } from '../linux-package-downloaded-status'
import { QUIT_AND_INSTALL_DELAY_MS } from './updater-state'
import { UpdaterRemoteStatus } from './updater-remote-status'
import { prepareThisProcessShipItStaging } from './shipit-leftover-recovery'
import {
  armForkBackgroundDownload,
  consumeForkBackgroundDownloadFailure,
  disarmForkBackgroundDownload,
  forkBackgroundDownloadFollowUp,
  isForkBackgroundDownloadArmed
} from '../../fork/private-github-background-download'

/** Coordinates renderer-facing download/install actions and their duplicate guards. */
export abstract class UpdaterDownloadInstall extends UpdaterRemoteStatus {
  protected quitAndInstall(): void {
    if (
      this.localBuildSelectionInProgress ||
      this.pinnedBuildSelectionInProgress ||
      this.pendingQuitAndInstallTimer ||
      this.quitAndInstallInProgress ||
      isMacInstallRequested()
    ) {
      return
    }

    if (this.deferHeadlessServeInstall('install', this.getPendingInstallVersion())) {
      return
    }
    // A queued check must not repoint the feed while native staging or installation is pending.
    this.finishActiveUpdateCheckAttempt()
    this.clearBackgroundCheckLaunchPending()
    if (
      !this.isMacStagingDeferredToInstall() &&
      deferMacQuitUntilInstallerReady(
        this.currentStatus,
        this.hasInstallableDownloadedVersion(),
        () => this.getPendingInstallVersion(),
        (status) => this.sendStatus(status)
      )
    ) {
      return
    }

    if (process.platform === 'darwin') {
      setMacInstallPreflightInProgress(true)
    }
    // Why: defer the quit a tick so the renderer can flush dismissals/state before windows start closing.
    this.pendingQuitAndInstallTimer = setTimeout(() => {
      void this.performQuitAndInstall()
    }, QUIT_AND_INSTALL_DELAY_MS)
  }

  protected downloadUpdate(): void {
    if (
      this.localBuildSelectionInProgress ||
      this.pinnedBuildSelectionInProgress ||
      this.pendingQuitAndInstallTimer ||
      this.quitAndInstallInProgress ||
      isMacInstallRequested() ||
      this.downloadInFlight
    ) {
      return
    }
    // Why: allow retry from 'error' (availableVersion stays cached) so the error card's Retry Download button works.
    const canStart =
      this.currentStatus.state === 'available' ||
      (this.currentStatus.state === 'error' && this.hasInstallableDownloadedVersion())
    if (!canStart) {
      return
    }
    const version =
      this.currentStatus.state === 'available' ? this.currentStatus.version : this.availableVersion
    if (!version) {
      return
    }
    // Why: main owns this verdict, not the card — an older renderer or a direct IPC call must not be
    // able to spend a package download that this host could never install.
    if (isExternallyManagedLinuxInstall()) {
      recordUpdaterLifecycle('linux_package_externally_managed_download_blocked', {
        version
      })
      // Why: a pinned jump resolves to 'release' on Linux (no dev-channel artifact is built for it),
      // so refusing without unwinding would strand isPinnedBuildActive and silently kill every
      // background check for the rest of the process. A no-op on the ordinary release path.
      this.clearAvailableUpdateContext()
      this.restoreReleaseUpdateSource()
      this.sendStatus({
        state: 'error',
        message: LINUX_PACKAGE_EXTERNALLY_MANAGED_MESSAGE,
        version,
        retryable: false
      })
      return
    }
    if (this.deferHeadlessServeInstall('download', version)) {
      return
    }
    this.downloadInFlight = true
    const localBuildDownload = this.activeUpdateSource === 'local'
    // fork: 后台下载和手动下载共用这条路径，后台失败不能把请求错误写进状态。
    const backgroundDownload = isForkBackgroundDownloadArmed()
    beginMacUpdateDownload()
    // Why: setup can take seconds before progress emits; surface acceptance now so the action never looks inert.
    this.sendStatus({ state: 'downloading', percent: 0, version })
    const settleBackgroundDownloadFailure = (): boolean => {
      if (!backgroundDownload) {
        return false
      }
      this.downloadInFlight = false
      const manualFallback = consumeForkBackgroundDownloadFailure(version)
      if (manualFallback) {
        this.sendStatus(manualFallback)
      }
      return true
    }
    const startDownload = (): void => {
      this.getAutoUpdater()
        .downloadUpdate()
        .catch((err) => {
          if (settleBackgroundDownloadFailure()) {
            return
          }
          this.downloadInFlight = false
          const message = String(err?.message ?? err)
          if (localBuildDownload) {
            this.sendLocalBuildErrorAndRestore(message)
          } else {
            this.sendErrorStatus(message)
          }
        })
    }
    // Why before the download: Squirrel stages as soon as it ends, unless staging waits for install.
    const preparingStaging = this.isMacStagingDeferredToInstall()
      ? null
      : prepareThisProcessShipItStaging()
    if (preparingStaging) {
      void preparingStaging.then(startDownload, (error: unknown) => {
        if (!settleBackgroundDownloadFailure()) {
          throw error
        }
      })
    } else {
      startDownload()
    }
  }

  /** 私有源后台下载：先标成可下载再走 downloadUpdate，失败时不把请求错误写进日志。 */
  protected downloadForkBackgroundUpdate(version: string): void {
    this.availableVersion = version
    this.currentStatus = { state: 'available', version, changelog: null }
    armForkBackgroundDownload(version)
    this.downloadUpdate()
    const followUp = forkBackgroundDownloadFollowUp(this.currentStatus)
    if (followUp === 'started') {
      return
    }
    disarmForkBackgroundDownload()
    if (followUp === 'show-offer') {
      this.sendStatus(this.currentStatus)
    }
  }

  protected isQuittingForUpdate(): boolean {
    return this.quittingForUpdate
  }
}
