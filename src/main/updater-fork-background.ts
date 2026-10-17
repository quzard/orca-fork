import { createForkUpdateAdapter } from '../fork/private-github-background-download'
import type { ForkUpdateAdapter } from '../fork/private-github-background-download'
import type { UpdaterHandlerContext } from './updater-handler-context'
import { resetMacInstallState } from './updater-mac-install'

export function bindForkBackgroundUpdates(ctx: UpdaterHandlerContext): ForkUpdateAdapter {
  return createForkUpdateAdapter({
    localOrPinned: () => ctx.isLocalBuildCheck() || ctx.isPinnedBuildCheck(),
    status: ctx.getCurrentStatus,
    schedule: ctx.scheduleAutomaticUpdateCheck,
    record: ctx.recordCompletedUpdateCheck,
    finish: () => ctx.finishActiveUpdateCheckAttempt?.(),
    setVersion: ctx.setAvailableVersion,
    sendStatus: ctx.sendStatus,
    sendDownloaded: (version) => {
      ctx.sendStatus({ state: 'downloaded', version, releaseUrl: ctx.getKnownReleaseUrl() })
    },
    download: (version) => ctx.beginForkBackgroundDownload?.(version),
    clearStaleDownload: () => {
      resetMacInstallState()
      ctx.clearAvailableUpdateContext()
    },
    setUserInitiated: ctx.setUserInitiatedCheck,
    restore: ctx.restoreReleaseUpdateSource,
    recover: (userInitiated) => ctx.recoverForkStagedCheckFailure?.(userInitiated) ?? false
  })
}
