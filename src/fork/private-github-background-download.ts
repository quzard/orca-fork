// fork: fork 发布源（有无令牌都算）发现新版本后后台下载，只提示一次重启；未登记 fork 发布源时这些判断都不生效。

import { forkReleaseFeedDecision } from '../shared/fork-hooks/update-feed'
import type { UpdateStatus } from '../shared/update-status-types'
import {
  AUTO_UPDATE_CHECK_INTERVAL_MS,
  AUTO_UPDATE_RETRY_INTERVAL_MS
} from '../main/updater/updater-state'

export const FORK_BACKGROUND_DOWNLOAD_FAILURE_LOG =
  '[updater] background download failed; use the update button'

export const FORK_BACKGROUND_CHECK_FAILURE_LOG =
  '[updater] background update check failed; keeping the downloaded update'

export type ForkUpdatePhase = UpdateStatus['state']

export type ForkAutoInstallOnQuitInput = {
  forkReady: boolean
  interactive: boolean
  linuxNonRootImplicitQuit: boolean
  platform: NodeJS.Platform
}

type ForkOffer = 'passthrough' | 'download' | 'restart' | 'keep'

type ForkFoundUpdateInput = {
  localOrPinned: boolean
  version: string
  userInitiated: boolean
  downloadingVersion: string | null
}

export type ForkCheckFailurePlan =
  | { kind: 'none' }
  | { kind: 'keep'; version: string }
  | { kind: 'restart'; version: string }

let downloadedVersion: string | null = null
let activeDownloadVersion: string | null = null
let backgroundActive = false

export function resetForkBackgroundDownloadState(): void {
  downloadedVersion = null
  activeDownloadVersion = null
  backgroundActive = false
}

export function isForkGithubUpdateReady(): boolean {
  return forkReleaseFeedDecision().kind === 'ready'
}

export function forkStagedUpdateVersion(): string | null {
  return downloadedVersion
}

/** 上游仍只在 Linux 非 root 包上退出即装。私有源的交互会话在 Mac/Windows 上也退出即装。 */
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
  if (input.status === 'downloading' || activeDownloadVersion) {
    return true
  }
  return input.status === 'downloaded' && downloadedVersion !== null
}

export function shouldPreserveForkDownloadedContext(localOrPinned: boolean): boolean {
  if (localOrPinned || !isForkGithubUpdateReady()) {
    return false
  }
  return downloadedVersion !== null || activeDownloadVersion !== null
}

export function planForkFoundUpdate(input: ForkFoundUpdateInput): ForkOffer {
  if (!isForkGithubUpdateReady() || input.localOrPinned) {
    return 'passthrough'
  }
  if (input.downloadingVersion || activeDownloadVersion) {
    return 'keep'
  }
  if (downloadedVersion === input.version) {
    return input.userInitiated ? 'restart' : 'keep'
  }
  return 'download'
}

export function planForkMissingUpdate(userInitiated: boolean): Exclude<ForkOffer, 'download'> {
  if (!isForkGithubUpdateReady() || !downloadedVersion) {
    return 'passthrough'
  }
  return userInitiated ? 'restart' : 'keep'
}

/** 第一次记下这个版本，后面的后台检查用它避免再次弹出重启卡片。 */
export function noteForkUpdateDownloaded(version: string, localOrPinned: boolean): void {
  if (localOrPinned || !isForkGithubUpdateReady() || !version) {
    return
  }
  downloadedVersion = version
  activeDownloadVersion = null
  backgroundActive = false
}

export function armForkBackgroundDownload(version: string): void {
  if (downloadedVersion !== version) {
    downloadedVersion = null
  }
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

export type ForkUpdateEffects = {
  schedule: () => void
  finish: () => void
  download: (version: string) => void
  restart: (version: string) => void
}

export function takeForkFoundUpdate(
  input: ForkFoundUpdateInput,
  effects: ForkUpdateEffects
): boolean {
  const effect = planForkFoundUpdate(input)
  if (effect === 'passthrough') {
    return false
  }
  effects.schedule()
  if (effect === 'keep') {
    effects.finish()
    return true
  }
  if (effect === 'download') {
    effects.download(input.version)
    return true
  }
  effects.restart(downloadedVersion ?? input.version)
  return true
}

export function takeForkMissingUpdate(
  userInitiated: boolean,
  effects: Pick<ForkUpdateEffects, 'schedule' | 'finish' | 'restart'>
): boolean {
  const effect = planForkMissingUpdate(userInitiated)
  if (effect === 'passthrough') {
    return false
  }
  effects.schedule()
  if (effect === 'keep') {
    effects.finish()
    return true
  }
  const version = downloadedVersion
  if (!version) {
    effects.finish()
    return true
  }
  effects.restart(version)
  return true
}

export function planForkCheckFailure(
  status: ForkUpdatePhase,
  userInitiated: boolean,
  source: { localBuild?: boolean; pinned?: boolean } = {}
): ForkCheckFailurePlan {
  // 本地构建和固定版本失败必须走原来的恢复，不能被私有源的已下载版本吞掉。
  if (
    source.localBuild ||
    source.pinned ||
    !isForkGithubUpdateReady() ||
    !downloadedVersion ||
    backgroundActive
  ) {
    return { kind: 'none' }
  }
  if (status === 'downloading') {
    return { kind: 'keep', version: downloadedVersion }
  }
  if (status === 'downloaded' && !userInitiated) {
    return { kind: 'keep', version: downloadedVersion }
  }
  if (status === 'downloaded' || status === 'checking') {
    return { kind: 'restart', version: downloadedVersion }
  }
  return { kind: 'none' }
}

export type ForkUpdateAdapter = {
  onChecking: (userInitiated: boolean) => boolean
  takeFound: (version: string, userInitiated: boolean, retrySoon: boolean) => boolean
  takeMissing: (userInitiated: boolean, retrySoon: boolean) => boolean
  noteDownloaded: (version: string) => void
  onUpdaterError: (pendingVersion: string, userInitiated?: boolean) => boolean
}

export function createForkUpdateAdapter(deps: {
  localOrPinned: () => boolean
  status: () => UpdateStatus
  schedule: (delayMs: number) => void
  record: () => void
  finish: () => void
  setVersion: (version: string) => void
  sendStatus: (status: UpdateStatus) => void
  sendDownloaded: (version: string) => void
  download: (version: string) => void
  clearStaleDownload: () => void
  setUserInitiated: (value: boolean) => void
  restore: () => void
  recover: (userInitiated?: boolean) => boolean
}): ForkUpdateAdapter {
  const scheduleCheck = (userInitiated: boolean, retrySoon: boolean): void => {
    if (deps.localOrPinned()) {
      return
    }
    if (retrySoon) {
      deps.schedule(AUTO_UPDATE_RETRY_INTERVAL_MS)
      return
    }
    deps.record()
    if (!userInitiated) {
      deps.schedule(AUTO_UPDATE_CHECK_INTERVAL_MS)
    }
  }
  const effectsFor = (userInitiated: boolean, retrySoon: boolean): ForkUpdateEffects => ({
    schedule: () => scheduleCheck(userInitiated, retrySoon),
    finish: deps.finish,
    download: (version) => {
      deps.setVersion(version)
      deps.download(version)
    },
    restart: (version) => {
      deps.setVersion(version)
      deps.sendDownloaded(version)
    }
  })
  return {
    onChecking: (userInitiated) => {
      const localOrPinned = deps.localOrPinned()
      if (
        shouldHoldForkUpdateCheck({ userInitiated, status: deps.status().state, localOrPinned })
      ) {
        return true
      }
      if (!shouldPreserveForkDownloadedContext(localOrPinned)) {
        deps.clearStaleDownload()
      }
      return false
    },
    takeFound: (version, userInitiated, retrySoon) => {
      const status = deps.status()
      return takeForkFoundUpdate(
        {
          localOrPinned: deps.localOrPinned(),
          version,
          userInitiated,
          downloadingVersion: status.state === 'downloading' ? status.version : null
        },
        effectsFor(userInitiated, retrySoon)
      )
    },
    takeMissing: (userInitiated, retrySoon) => {
      if (!takeForkMissingUpdate(userInitiated, effectsFor(userInitiated, retrySoon))) {
        return false
      }
      deps.setUserInitiated(false)
      if (deps.localOrPinned()) {
        deps.restore()
      }
      return true
    },
    noteDownloaded: (version) => noteForkUpdateDownloaded(version, deps.localOrPinned()),
    onUpdaterError: (pendingVersion, userInitiated) => {
      const manual = consumeForkBackgroundDownloadFailure(pendingVersion)
      if (manual) {
        deps.setVersion(manual.version)
        deps.sendStatus(manual)
        return true
      }
      return deps.recover(userInitiated)
    }
  }
}
