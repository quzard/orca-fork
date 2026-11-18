// fork: the fork's updater methods, as a class between upstream's UpdaterDownloadInstall and
// UpdaterSetup, so they read the updater's protected state without living in upstream files.
import { UpdaterDownloadInstall } from '../../main/updater/lifecycle/updater-download-install'
import type { UpdateCheckVariant } from '../../main/updater/lifecycle/updater-types'
import {
  FORK_BACKGROUND_CHECK_FAILURE_LOG,
  armForkBackgroundDownload,
  disarmForkBackgroundDownload,
  forkBackgroundDownloadFollowUp,
  planForkCheckFailure
} from './fork-background-download'
import { pinForkUpdateFeed } from './updater-background-wiring'

export abstract class ForkBackgroundUpdates extends UpdaterDownloadInstall {
  /** A fork build pins its own release feed before upstream resolves a release tag. */
  protected override async pinDefaultReleaseFeed(
    variant: UpdateCheckVariant = 'default'
  ): Promise<'ready' | 'not-available'> {
    if (pinForkUpdateFeed(this.getAutoUpdater())) {
      return 'ready'
    }
    return super.pinDefaultReleaseFeed(variant)
  }

  /** A failed check must not drop a downloaded or staging fork update. */
  protected keepForkStagedUpdate(userInitiated?: boolean): boolean {
    const plan = planForkCheckFailure(this.currentStatus.state, Boolean(userInitiated), {
      localBuild: this.activeUpdateSource === 'local',
      pinned: this.isPinnedBuildActive
    })
    if (plan.kind === 'none') {
      return false
    }
    console.info(FORK_BACKGROUND_CHECK_FAILURE_LOG)
    this.backgroundCheckLaunchPending = false
    this.userInitiatedCheck = false
    this.finishActiveUpdateCheckAttempt()
    this.availableVersion = plan.version
    if (plan.kind === 'restart') {
      this.sendStatus({
        state: 'downloaded',
        version: plan.version,
        releaseUrl: this.getKnownReleaseUrl()
      })
    }
    if (plan.kind === 'staging') {
      this.sendStatus({ state: 'downloading', percent: 100, version: plan.version })
    }
    if (!userInitiated) {
      this.scheduleAutomaticUpdateCheck(this.getAutomaticRetryInterval())
    }
    return true
  }

  /** fork 源后台下载：先标成可下载再走 downloadUpdate，失败时不把请求错误写进日志。 */
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
}
