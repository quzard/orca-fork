// 地址栏跳到工作区外的 HTML。解析只判断能不能预览，提交才记下和点击相同的 SSH 预览。
// 路由关掉或目标进禁用列表后，清掉地址栏写的记录。点击记下的预览不在这批记录里。
import { isHtmlFilePath } from '@/components/terminal-pane/local-html-file-destinations'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import {
  forgetIneligibleAddressBarTerminalHtmlPreviews,
  markAddressBarTerminalHtmlPreview,
  registerManagedSshAddressPreview,
  rememberTerminalHtmlPreview
} from '../../shared/fork-hooks/terminal-html-preview'
import { sshBrowserRoute, sshDirectoryLocation } from './html-preview-open'

function readAppState(state: unknown): AppState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 地址栏钩子只由渲染进程传入 AppState，没有第二套状态。
  return state as AppState
}

function eligibleRoute(worktreeId: string, filePath: string, state: AppState) {
  if (!isHtmlFilePath(filePath)) {
    return null
  }
  const route = sshBrowserRoute(worktreeId, state)
  // 点击在开关关掉时也要避开 file://。地址栏关掉时页在本机分区，不能收成远端预览。
  if (!route?.eligible) {
    return null
  }
  const root = state.getKnownWorktreeById(worktreeId)?.path ?? null
  if (root && isPathInsideOrEqual(root, filePath)) {
    return null
  }
  return route
}

/** 解析、补全可以调用。不写记录。 */
export function managedSshAddressPreviewEligible(
  worktreeId: string,
  filePath: string,
  state: AppState
): boolean {
  const route = eligibleRoute(worktreeId, filePath, state)
  return route !== null && sshDirectoryLocation(route.targetId, filePath) !== null
}

/** 提交时记下。连接 id 是当时的真实 sshTargetId。 */
export function rememberManagedSshAddressPreview(
  worktreeId: string,
  filePath: string,
  state: AppState
): boolean {
  const route = eligibleRoute(worktreeId, filePath, state)
  if (!route) {
    return false
  }
  const location = sshDirectoryLocation(route.targetId, filePath)
  if (!location) {
    return false
  }
  rememberTerminalHtmlPreview(worktreeId, filePath, location)
  markAddressBarTerminalHtmlPreview(worktreeId, filePath)
  return true
}

function routingSettingsChanged(
  previous: NonNullable<AppState['settings']>,
  next: NonNullable<AppState['settings']>
): boolean {
  if (previous.browserSshWorkspaceRoutingEnabled !== next.browserSshWorkspaceRoutingEnabled) {
    return true
  }
  const left = previous.browserSshWorkspaceRoutingDisabledTargetIds ?? []
  const right = next.browserSshWorkspaceRoutingDisabledTargetIds ?? []
  return left.length !== right.length || left.some((id, index) => id !== right[index])
}

let stopRoutingWatch: (() => void) | null = null

/** 渲染进程启动时登记。重复调用会换掉上一次的设置监听。 */
export function installManagedSshAddressPreview(): void {
  registerManagedSshAddressPreview({
    eligible: (worktreeId, filePath, state) =>
      managedSshAddressPreviewEligible(worktreeId, filePath, readAppState(state)),
    remember: (worktreeId, filePath, state) =>
      rememberManagedSshAddressPreview(worktreeId, filePath, readAppState(state)),
    routeEligible: (worktreeId, state) =>
      sshBrowserRoute(worktreeId, readAppState(state))?.eligible === true
  })
  stopRoutingWatch?.()
  stopRoutingWatch = useAppStore.subscribe((state, previous) => {
    // 测试和启动会先落到还没有 settings 的状态，这次通知没有路由开关可比。
    if (!previous?.settings || !state.settings) {
      return
    }
    if (!routingSettingsChanged(previous.settings, state.settings)) {
      return
    }
    forgetIneligibleAddressBarTerminalHtmlPreviews(
      (worktreeId) => sshBrowserRoute(worktreeId, state)?.eligible === true
    )
  })
}
