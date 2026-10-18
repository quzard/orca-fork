// fork: fork 发布源发现新版本后后台下载，只提示一次重启；未登记 fork 发布源时这些判断都不生效。
// macOS 上 electron-updater 的 update-downloaded 早于 Squirrel 暂存完成。暂存完成前只记作「暂存中」：
// 不弹重启卡片；暂存失败时交还上游的错误状态，用户可以重新检查。

import { forkReleaseFeedDecision } from '../../shared/fork-hooks/update-feed'
import type { UpdateStatus } from '../../shared/update-status-types'

export const FORK_BACKGROUND_DOWNLOAD_FAILURE_LOG =
  '[updater] background download failed; use the update button'

export const FORK_BACKGROUND_CHECK_FAILURE_LOG =
  '[updater] background update check failed; keeping the downloaded update'

export const FORK_STAGING_FAILURE_LOG =
  '[updater] macOS could not stage the downloaded update; check for updates to retry'

export type ForkUpdatePhase = UpdateStatus['state']

export type ForkAutoInstallOnQuitInput = {
  forkReady: boolean
  interactive: boolean
  linuxNonRootImplicitQuit: boolean
  platform: NodeJS.Platform
}

type ForkOffer = 'passthrough' | 'download' | 'restart' | 'keep' | 'staging'

export type ForkFoundUpdateInput = {
  localOrPinned: boolean
  version: string
  userInitiated: boolean
  downloadingVersion: string | null
}

export type ForkCheckFailurePlan =
  | { kind: 'none' }
  | { kind: 'keep'; version: string }
  | { kind: 'restart'; version: string }
  | { kind: 'staging'; version: string }

/** 已下载且安装器就绪（macOS 上 Squirrel 已暂存）的版本。只有它能弹重启卡片。 */
let downloadedVersion: string | null = null
/** 已下载但安装器还没就绪的版本。 */
let stagingVersion: string | null = null
let activeDownloadVersion: string | null = null
let backgroundActive = false
let installerReady: () => boolean = () => true

export function resetForkBackgroundDownloadState(): void {
  downloadedVersion = null
  stagingVersion = null
  activeDownloadVersion = null
  backgroundActive = false
  installerReady = () => true
}

/** macOS 传 isMacInstallerReady，其它平台下载完就算就绪。 */
export function registerForkInstallerReadyProbe(probe: () => boolean): void {
  installerReady = probe
}

/** 暂存完成后才把版本升为已下载。 */
function readyVersion(): string | null {
  if (stagingVersion && installerReady()) {
    downloadedVersion = stagingVersion
    stagingVersion = null
  }
  return downloadedVersion
}

function pendingStagingVersion(): string | null {
  readyVersion()
  return stagingVersion
}

export function isForkGithubUpdateReady(): boolean {
  return forkReleaseFeedDecision().kind === 'ready'
}

export function forkStagedUpdateVersion(): string | null {
  return readyVersion()
}

export function forkStagingUpdateVersion(): string | null {
  return pendingStagingVersion()
}

/**
 * Squirrel 暂存失败。清掉暂存中的版本并返回 true，调用方让上游把错误显示出来。
 * 没有暂存中的版本，或安装器已经就绪时返回 false。
 */
export function failForkStaging(): boolean {
  if (!pendingStagingVersion()) {
    return false
  }
  stagingVersion = null
  console.warn(FORK_STAGING_FAILURE_LOG)
  return true
}

/** 上游仍只在 Linux 非 root 包上退出即装。fork 源的交互会话在 Mac/Windows 上也退出即装。 */
export function forkAutoInstallOnQuit(input: ForkAutoInstallOnQuitInput): boolean {
  if (!input.interactive) {
    return false
  }
  if (input.forkReady && input.platform !== 'linux') {
    return true
  }
  return input.linuxNonRootImplicitQuit
}

export function shouldHoldForkUpdateCheck(input: {
  userInitiated: boolean
  status: ForkUpdatePhase
  localOrPinned: boolean
}): boolean {
  if (!isForkGithubUpdateReady() || input.localOrPinned || input.userInitiated) {
    return false
  }
  if (input.status === 'downloading' || activeDownloadVersion || pendingStagingVersion()) {
    return true
  }
  return input.status === 'downloaded' && readyVersion() !== null
}

export function shouldPreserveForkDownloadedContext(localOrPinned: boolean): boolean {
  if (localOrPinned || !isForkGithubUpdateReady()) {
    return false
  }
  return readyVersion() !== null || stagingVersion !== null || activeDownloadVersion !== null
}

export function planForkFoundUpdate(input: ForkFoundUpdateInput): ForkOffer {
  if (!isForkGithubUpdateReady() || input.localOrPinned) {
    return 'passthrough'
  }
  if (input.downloadingVersion || activeDownloadVersion) {
    return 'keep'
  }
  // 暂存中不重新下载，也不弹重启卡片；手动检查时把界面放回「已下载 100%」。
  if (pendingStagingVersion()) {
    return input.userInitiated ? 'staging' : 'keep'
  }
  if (readyVersion() === input.version) {
    return input.userInitiated ? 'restart' : 'keep'
  }
  return 'download'
}

export function planForkMissingUpdate(userInitiated: boolean): Exclude<ForkOffer, 'download'> {
  if (!isForkGithubUpdateReady()) {
    return 'passthrough'
  }
  if (pendingStagingVersion()) {
    return userInitiated ? 'staging' : 'keep'
  }
  if (!readyVersion()) {
    return 'passthrough'
  }
  return userInitiated ? 'restart' : 'keep'
}

/**
 * electron-updater 下载完成时调用（macOS 上早于 Squirrel 暂存）。先记作暂存中，
 * 安装器就绪后才升为已下载。后面的后台检查用它避免重新下载和再次弹出重启卡片。
 */
export function noteForkUpdateDownloaded(version: string, localOrPinned: boolean): void {
  if (localOrPinned || !isForkGithubUpdateReady() || !version) {
    return
  }
  downloadedVersion = null
  stagingVersion = version
  activeDownloadVersion = null
  backgroundActive = false
}

export function armForkBackgroundDownload(version: string): void {
  if (downloadedVersion !== version) {
    downloadedVersion = null
  }
  stagingVersion = null
  activeDownloadVersion = version
  backgroundActive = true
}

export function isForkBackgroundDownloadArmed(): boolean {
  return backgroundActive
}

/** downloadUpdate 返回后：已开始下载就保持武装，仍是可下载就交给手动卡片，其它状态保持原样。 */
export function forkBackgroundDownloadFollowUp(
  status: UpdateStatus
): 'started' | 'show-offer' | 'leave' {
  return status.state === 'downloading'
    ? 'started'
    : status.state === 'available'
      ? 'show-offer'
      : 'leave'
}

export function consumeForkBackgroundDownloadFailure(
  version: string
): Extract<UpdateStatus, { state: 'available' }> | null {
  if (!backgroundActive) {
    return null
  }
  backgroundActive = false
  activeDownloadVersion = null
  console.info(FORK_BACKGROUND_DOWNLOAD_FAILURE_LOG)
  if (!version) {
    return null
  }
  return { state: 'available', version, changelog: null }
}

export function disarmForkBackgroundDownload(): void {
  backgroundActive = false
  activeDownloadVersion = null
}

export function planForkCheckFailure(
  status: ForkUpdatePhase,
  userInitiated: boolean,
  source: { localBuild?: boolean; pinned?: boolean } = {}
): ForkCheckFailurePlan {
  // 本地构建和固定版本失败必须走原来的恢复，不能被 fork 源的已下载版本吞掉。
  if (source.localBuild || source.pinned || !isForkGithubUpdateReady() || backgroundActive) {
    return { kind: 'none' }
  }
  // 暂存中的检查失败：保留暂存，界面回到「已下载 100%」，不弹重启卡片。
  // 暂存本身失败走 failForkStaging，这里不处理。
  const staging = pendingStagingVersion()
  if (staging) {
    if (status === 'downloading') {
      return { kind: 'keep', version: staging }
    }
    return status === 'checking' ? { kind: 'staging', version: staging } : { kind: 'none' }
  }
  const ready = readyVersion()
  if (!ready) {
    return { kind: 'none' }
  }
  if (status === 'downloading') {
    return { kind: 'keep', version: ready }
  }
  if (status === 'downloaded' && !userInitiated) {
    return { kind: 'keep', version: ready }
  }
  if (status === 'downloaded' || status === 'checking') {
    return { kind: 'restart', version: ready }
  }
  return { kind: 'none' }
}
