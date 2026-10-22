import { app } from 'electron'
<<<<<<< HEAD
import { is } from '@electron-toolkit/utils'
import {
  FORK_UPSTREAM_RELEASE_BLOCKED,
  forkReleaseFeedDecision
} from '../../shared/fork-hooks/update-feed'
=======
import { isMacInstallRequested } from '../updater-mac-install'
import type { UpdateCheckOptions } from '../../shared/update-status-types'
>>>>>>> 814bb59ef67549917beca178854fad5aee7dfe04
import type { ReleaseChannel } from '../../shared/release-channel'
import type { UpdateCheckOptions } from '../../shared/update-status-types'
import { isMacInstallRequested } from '../updater-mac-install'
import { UpdaterScheduling } from './updater-scheduling'

/** Handles checks initiated from the desktop menu and modifier-key variants. */
export abstract class UpdaterMenuChecks extends UpdaterScheduling {
  protected checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    if (
      this.pendingQuitAndInstallTimer ||
      this.quitAndInstallInProgress ||
      isMacInstallRequested()
    ) {
      return
    }
    if (!app.isPackaged) {
      this.sendStatus({ state: 'not-available', userInitiated: true })
      return
    }
    if (options?.localBuild) {
      void this.checkForLocalBuildFromMenu()
      return
    }
    if (options?.targetTag && options.channel) {
      void this.checkForPinnedBuild(options.channel, options.targetTag)
      return
    }
    // fork: fork 构建没登记更新源时说明原因，不进入上游检查。登记了就继续，pin 会改到 quzard/orca-fork。
    if (forkReleaseFeedDecision().kind === 'skip') {
      this.sendStatus({
        state: 'error',
        message: FORK_UPSTREAM_RELEASE_BLOCKED,
        retryable: false,
        userInitiated: true
      })
      return
    }
    if (this.localBuildSelectionInProgress || this.pinnedBuildSelectionInProgress) {
      return
    }
    if (
      this.activeUpdateSource !== 'release' &&
      (this.currentStatus.state === 'checking' || this.currentStatus.state === 'downloading')
    ) {
      return
    }
    this.restoreReleaseUpdateSource()

    const checkVariant = this.getUpdateCheckVariant(options)
    if (checkVariant === 'prerelease') {
      this.clearPrereleaseFallbackContext()
      this.enableIncludePrerelease()
    } else if (checkVariant === 'perf') {
      this.clearPrereleaseFallbackContext()
      // Why: perf checks need prerelease manifests now, but must not opt future default/background checks into the RC channel.
      this.enablePrereleaseManifestChecks()
    }

    const checkAlreadyInFlight =
      this.backgroundCheckLaunchPending || this.currentStatus.state === 'checking'
    this.userInitiatedCheck = true
    // Why: manual checks are nudge-independent; clear the marker so a later dismiss can't consume the campaign by accident.
    this.activeUpdateNudgeId = null
    // Why: respond visibly before feed pinning/updater events; duplicate broadcasts are suppressed by status equality below.
    this.sendStatus({ state: 'checking', userInitiated: true })
    if (checkAlreadyInFlight) {
      this.backgroundCheckPromotedToUserInitiated = true
      this.rearmActiveUpdateCheckStallTimer()
      if (checkVariant !== 'default') {
        // Why: in-flight check may have pinned the stable feed; queue a fresh modifier check to avoid a stale-channel result.
        this.pendingUserInitiatedCheckAfterInFlight = checkVariant
      }
      return
    }

    const attemptId = this.beginUpdateCheckAttempt()
    const autoUpdater = this.getAutoUpdater()
    const launch = (): Promise<unknown> | undefined => {
      if (
        this.pendingQuitAndInstallTimer ||
        this.quitAndInstallInProgress ||
        isMacInstallRequested()
      ) {
        return undefined
      }
      if (!this.isActiveUpdateCheckAttempt(attemptId)) {
        return undefined
      }
      this.markUpdateCheckLaunched(attemptId)
      return autoUpdater.checkForUpdates()
    }
    const run = this.pinDefaultReleaseFeed(checkVariant).then((preflightResult) => {
      if (preflightResult === 'not-available') {
        if (!this.isActiveUpdateCheckAttempt(attemptId)) {
          return false
        }
        this.userInitiatedCheck = false
        this.finishActiveUpdateCheckAttempt()
        this.recordCompletedUpdateCheck()
        this.sendSettledCheckStatus({ state: 'not-available', userInitiated: true })
        return false
      }
      return launch()
    })
    void Promise.resolve(run)
      .then((launchResult) => {
        if (launchResult === false) {
          return
        }
        this.handleSettledUpdateCheckPromise(attemptId)
      })
      .catch((err) => {
        if (!this.isActiveUpdateCheckAttempt(attemptId)) {
          return
        }
        this.userInitiatedCheck = false
        void this.sendCheckFailureStatus(String(err?.message ?? err), true, 'promise', err)
      })
  }

  protected abstract checkForLocalBuildFromMenu(): Promise<void>
  protected abstract checkForPinnedBuild(channel: ReleaseChannel, tag: string): Promise<void>
}
