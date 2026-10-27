import { parseAppSshPtyId } from '../../shared/ssh-pty-id'
import { isRemoteRuntimePtyId } from '../../shared/remote-runtime/remote-runtime-pty-id'
import {
  isForkTuiRepaintActive,
  setForkTuiRepaintActive,
  type TerminalReconnectFitInfo
} from '../../shared/fork-hooks/terminal-lifecycle'

const TUI_REPAINT_PULSE_MS = 200

const pulseTokens = new Map<string, object>()
const deferredPtyIds = new Set<string>()

export type TuiRepaintResize = (ptyId: string, cols: number, rows: number) => void

/**
 * The reattach fit asks for the original size immediately after the pulse
 * shrinks one column. Keep that fit quiet until the pulse restores the size.
 * With no active pulse this is the original check.
 */
export function holdResizeForTuiPulse(
  getPtyId: () => string | null,
  suppressFittedResize: () => boolean
): () => boolean {
  return () => {
    const ptyId = getPtyId()
    return suppressFittedResize() || Boolean(ptyId && isForkTuiRepaintActive(ptyId))
  }
}

/** SSH reconnects ignore a same-size SIGWINCH. A one-column shrink forces the TUI to redraw. */
export function pulseSshReconnectTui(
  info: TerminalReconnectFitInfo,
  resize: TuiRepaintResize,
  schedule: (callback: () => void, delayMs: number) => void = (callback, delayMs) => {
    setTimeout(callback, delayMs)
  }
): boolean {
  if (!parseAppSshPtyId(info.ptyId) || isRemoteRuntimePtyId(info.ptyId)) {
    return false
  }
  if (info.restoredFromModel) {
    deferredPtyIds.delete(info.ptyId)
    return false
  }
  if (info.visible === false) {
    deferredPtyIds.add(info.ptyId)
    return false
  }
  if (info.cols <= 2 || info.rows <= 0) {
    return false
  }
  deferredPtyIds.delete(info.ptyId)
  const token = {}
  pulseTokens.set(info.ptyId, token)
  setForkTuiRepaintActive(info.ptyId, true)
  resize(info.ptyId, info.cols - 1, info.rows)
  schedule(() => {
    if (pulseTokens.get(info.ptyId) !== token) {
      return
    }
    pulseTokens.delete(info.ptyId)
    setForkTuiRepaintActive(info.ptyId, false)
    resize(info.ptyId, info.cols, info.rows)
  }, TUI_REPAINT_PULSE_MS)
  return true
}

/** First show of a pane whose reconnect pulse was skipped while it was hidden. */
export function consumeDeferredSshReconnectTui(
  info: TerminalReconnectFitInfo,
  resize: TuiRepaintResize,
  schedule: (callback: () => void, delayMs: number) => void = (callback, delayMs) => {
    setTimeout(callback, delayMs)
  }
): boolean {
  if (!deferredPtyIds.has(info.ptyId)) {
    return false
  }
  return pulseSshReconnectTui(
    { ...info, visible: true, restoredFromModel: false },
    resize,
    schedule
  )
}
