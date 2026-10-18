import { autoUpdater as nativeUpdater } from 'electron'
import { registerForkInstallerReadyProbe } from '../fork/fork-background-download'
import { createForkUpdateAdapter } from '../fork/fork-update-adapter'
import type { ForkUpdateAdapter } from '../fork/fork-update-adapter'
import type { UpdaterHandlerContext } from './updater-handler-context'
import { isMacInstallerReady, resetMacInstallState } from './updater-mac-install'

const STAGING_FAILED = 'macOS could not stage the downloaded update'

export type { ForkUpdateAdapter }

// fork: 重启卡片要等安装器就绪；macOS 上就是 Squirrel 暂存完成。
export function bindForkBackgroundUpdates(ctx: UpdaterHandlerContext): ForkUpdateAdapter {
  if (process.platform === 'darwin') {
    registerForkInstallerReadyProbe(isMacInstallerReady)
  }
  const adapter = createForkUpdateAdapter({
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
    sendError: (message) => {
      resetMacInstallState()
      ctx.sendErrorStatus(message)
    },
    awaitingInstall: ctx.isAwaitingMacStaging,
    download: (version) => ctx.beginForkBackgroundDownload?.(version),
    clearStaleDownload: () => {
      resetMacInstallState()
      ctx.clearAvailableUpdateContext()
    },
    setUserInitiated: ctx.setUserInitiatedCheck,
    restore: ctx.restoreReleaseUpdateSource,
    recover: (userInitiated) => ctx.recoverForkStagedCheckFailure?.(userInitiated) ?? false
  })
  if (process.platform === 'darwin') {
    // 暂存失败时 MacUpdater 不一定把错误转发到还在处理的检查上；这里直接听 Squirrel。
    nativeUpdater.on('error', (error: unknown) => {
      const cause = error instanceof Error && error.message ? `: ${error.message}` : '.'
      adapter.onStagingError(`${STAGING_FAILED}${cause}`)
    })
  }
  return adapter
}
