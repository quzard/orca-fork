// fork (F010): SSH reconnect repaint. Unregistered, every call below leaves upstream behavior.

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

type PaneTerminal = {
  pane: { terminal: { cols: number; rows: number } }
  transport: { getPtyId(): string | null }
}

type ReattachFitSession = PaneTerminal & { deps: { isVisibleRef: { current: boolean } } }

type ReattachFitContext = {
  isCurrentReattachPayload(): boolean
  revealFollowsTerminalPark: boolean
  prefetchedParkModelSnapshot: unknown
}

// Optional: the renderer's session bag assigns it dynamically (installPtyInputForward runs first).
type DesktopResizeSession = PaneTerminal & { shouldSuppressDesktopPtyResize?: () => boolean }

const tuiRepaintPtyIds = new Set<string>()

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

export function registerTerminalReconnectFitHook(
  next: (info: TerminalReconnectFitInfo) => void
): void {
  reconnectFitHook = next
}

export function registerTerminalPaneShownHook(next: (info: TerminalPaneShownInfo) => void): void {
  paneShownHook = next
}

/** After a reattach fit settles; the caller already awaited `completion`. */
export function notifyTerminalReconnectFit(
  session: ReattachFitSession,
  ctx: ReattachFitContext,
  ptyId: string,
  completion: Promise<boolean>
): void {
  const hook = reconnectFitHook
  if (!hook) {
    return
  }
  void completion.then((completed) => {
    if (!ctx.isCurrentReattachPayload()) {
      return
    }
    hook({
      ptyId,
      cols: session.pane.terminal.cols,
      rows: session.pane.terminal.rows,
      restoredFromModel: ctx.revealFollowsTerminalPark && ctx.prefetchedParkModelSnapshot != null,
      visible: completed && session.deps.isVisibleRef.current
    })
  })
}

/** Visible resume. A pulse skipped while the pane was hidden runs on this first show. */
export function notifyTerminalPaneShown(session: PaneTerminal): void {
  const ptyId = session.transport.getPtyId()
  if (paneShownHook && ptyId) {
    paneShownHook({ ptyId, cols: session.pane.terminal.cols, rows: session.pane.terminal.rows })
  }
}

/** The fit after a one-column pulse must not push the old size back before the pulse restores it. */
export function holdDesktopResizeDuringTuiRepaint(session: DesktopResizeSession): void {
  const suppress = session.shouldSuppressDesktopPtyResize
  session.shouldSuppressDesktopPtyResize = () => {
    const ptyId = session.transport.getPtyId()
    return Boolean(suppress?.()) || (ptyId !== null && tuiRepaintPtyIds.has(ptyId))
  }
}
