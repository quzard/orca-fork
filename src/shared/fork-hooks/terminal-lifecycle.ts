// fork: 终端选择器解析与重连 fit 回调。解析器返回 null 时继续走上游匹配。

/** 主进程运行时实例。登记方在回调里收窄到自己要用的方法。 */
export type TerminalWorkspaceHost = {
  readonly forkTerminalHost?: true
}

export type TerminalWorkspaceResolver = (
  selector: string,
  runtime: TerminalWorkspaceHost
) => unknown

export type TerminalReconnectFitInfo = {
  ptyId: string
  cols: number
  rows: number
  /** A park-model frame already painted the pane, so a size pulse would wipe it. */
  restoredFromModel?: boolean
  /** False while the pane is hidden. The pulse waits for the first show. */
  visible?: boolean
}

export type TerminalPaneShownInfo = {
  ptyId: string
  cols: number
  rows: number
}

const tuiRepaintPtyIds = new Set<string>()

let workspaceResolver: TerminalWorkspaceResolver | undefined
let reconnectFitHook: ((info: TerminalReconnectFitInfo) => void) | undefined
let paneShownHook: ((info: TerminalPaneShownInfo) => void) | undefined

/** True while a reconnect redraw owns this PTY's size, so a follow-up fit does not undo the pulse. */
export function isForkTuiRepaintActive(ptyId: string): boolean {
  return tuiRepaintPtyIds.has(ptyId)
}

export function setForkTuiRepaintActive(ptyId: string, active: boolean): void {
  if (active) {
    tuiRepaintPtyIds.add(ptyId)
    return
  }
  tuiRepaintPtyIds.delete(ptyId)
}

export function registerTerminalWorkspaceResolver(next: TerminalWorkspaceResolver): void {
  workspaceResolver = next
}

export function getTerminalWorkspaceResolver(): TerminalWorkspaceResolver | undefined {
  return workspaceResolver
}

export function registerTerminalReconnectFitHook(
  next: (info: TerminalReconnectFitInfo) => void
): void {
  reconnectFitHook = next
}

export function notifyTerminalReconnectFit(info: TerminalReconnectFitInfo): void {
  reconnectFitHook?.(info)
}

export function registerTerminalPaneShownHook(next: (info: TerminalPaneShownInfo) => void): void {
  paneShownHook = next
}

export function notifyTerminalPaneShown(info: TerminalPaneShownInfo): void {
  paneShownHook?.(info)
}
