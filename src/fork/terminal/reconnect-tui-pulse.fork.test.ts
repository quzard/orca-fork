import { describe, expect, it } from 'vitest'
import {
  holdDesktopResizeDuringTuiRepaint,
  isForkTuiRepaintActive,
  notifyTerminalPaneShown,
  notifyTerminalReconnectFit,
  registerTerminalPaneShownHook,
  registerTerminalReconnectFitHook,
  setForkTuiRepaintActive,
  type TerminalPaneShownInfo,
  type TerminalReconnectFitInfo
} from '../../shared/fork-hooks/terminal-lifecycle'
import { pulseSshReconnectTui, consumeDeferredSshReconnectTui } from './reconnect-tui-pulse'

describe('pulseSshReconnectTui', () => {
  it('shrinks an ssh pty by one column, then restores the captured size', () => {
    const sizes: [number, number][] = []
    let restore = (): void => {}
    const pulsed = pulseSshReconnectTui(
      { ptyId: 'ssh:builder@@pty-1', cols: 80, rows: 24 },
      (_ptyId, cols, rows) => {
        sizes.push([cols, rows])
      },
      (callback) => {
        restore = callback
      }
    )
    expect(pulsed).toBe(true)
    expect(sizes).toEqual([[79, 24]])
    expect(isForkTuiRepaintActive('ssh:builder@@pty-1')).toBe(true)
    restore()
    expect(sizes).toEqual([
      [79, 24],
      [80, 24]
    ])
    expect(isForkTuiRepaintActive('ssh:builder@@pty-1')).toBe(false)
  })

  it('ignores a remote-runtime pty and a grid that is too narrow to shrink', () => {
    const resize = (): void => {
      throw new Error('resize')
    }
    expect(
      pulseSshReconnectTui({ ptyId: 'remote:env@@pty-1', cols: 80, rows: 24 }, resize, () => {})
    ).toBe(false)
    expect(pulseSshReconnectTui({ ptyId: 'pty-1', cols: 80, rows: 24 }, resize, () => {})).toBe(
      false
    )
    expect(
      pulseSshReconnectTui({ ptyId: 'ssh:builder@@pty-1', cols: 2, rows: 24 }, resize, () => {})
    ).toBe(false)
  })

  it('does not let an older pulse restore over a newer one', () => {
    const sizes: number[] = []
    const restores: (() => void)[] = []
    const resize = (_ptyId: string, cols: number): void => {
      sizes.push(cols)
    }
    pulseSshReconnectTui(
      { ptyId: 'ssh:builder@@pty-2', cols: 80, rows: 24 },
      resize,
      (callback) => {
        restores.push(callback)
      }
    )
    pulseSshReconnectTui(
      { ptyId: 'ssh:builder@@pty-2', cols: 90, rows: 24 },
      resize,
      (callback) => {
        restores.push(callback)
      }
    )
    restores[0]?.()
    expect(sizes).toEqual([79, 89])
    expect(isForkTuiRepaintActive('ssh:builder@@pty-2')).toBe(true)
    restores[1]?.()
    expect(sizes).toEqual([79, 89, 90])
    expect(isForkTuiRepaintActive('ssh:builder@@pty-2')).toBe(false)
  })

  it('skips the pulse when the pane was restored from the terminal model', () => {
    const resize = (): void => {
      throw new Error('resize')
    }
    expect(
      pulseSshReconnectTui(
        { ptyId: 'ssh:builder@@pty-4', cols: 80, rows: 24, restoredFromModel: true },
        resize,
        () => {}
      )
    ).toBe(false)
  })

  it('defers a hidden pane until it is shown, then pulses the size at show time', () => {
    const sizes: number[] = []
    expect(
      pulseSshReconnectTui(
        { ptyId: 'ssh:builder@@pty-5', cols: 80, rows: 24, visible: false },
        () => {
          throw new Error('resize')
        },
        () => {}
      )
    ).toBe(false)
    let restore = (): void => {}
    expect(
      consumeDeferredSshReconnectTui(
        { ptyId: 'ssh:builder@@pty-5', cols: 100, rows: 30 },
        (_ptyId, cols) => {
          sizes.push(cols)
        },
        (callback) => {
          restore = callback
        }
      )
    ).toBe(true)
    expect(sizes).toEqual([99])
    restore()
    expect(sizes).toEqual([99, 100])
    expect(
      consumeDeferredSshReconnectTui(
        { ptyId: 'ssh:builder@@pty-5', cols: 100, rows: 30 },
        () => {
          throw new Error('resize')
        },
        () => {}
      )
    ).toBe(false)
  })
})

describe('upstream hook sites', () => {
  const pane = (cols: number, ptyId: string | null = 'ssh:builder@@pty-6') => ({
    pane: { terminal: { cols, rows: 24 } },
    transport: { getPtyId: () => ptyId },
    deps: { isVisibleRef: { current: true } }
  })

  it('holds the desktop resize of a pulsing pty and otherwise keeps the upstream check', () => {
    let fitted = false
    const session = {
      ...pane(80, 'ssh:builder@@pty-3'),
      shouldSuppressDesktopPtyResize: () => fitted
    }
    holdDesktopResizeDuringTuiRepaint(session)
    expect(session.shouldSuppressDesktopPtyResize()).toBe(false)
    setForkTuiRepaintActive('ssh:builder@@pty-3', true)
    expect(session.shouldSuppressDesktopPtyResize()).toBe(true)
    setForkTuiRepaintActive('ssh:builder@@pty-3', false)
    fitted = true
    expect(session.shouldSuppressDesktopPtyResize()).toBe(true)
  })

  it('reports a settled reattach fit with the grid, park restore and visibility', async () => {
    const seen: TerminalReconnectFitInfo[] = []
    registerTerminalReconnectFitHook((info) => seen.push(info))
    const session = pane(120)
    const ctx = {
      isCurrentReattachPayload: () => true,
      revealFollowsTerminalPark: true,
      prefetchedParkModelSnapshot: null
    }
    notifyTerminalReconnectFit(session, ctx, 'ssh:builder@@pty-6', Promise.resolve(true))
    notifyTerminalReconnectFit(session, ctx, 'ssh:builder@@pty-6', Promise.resolve(false))
    notifyTerminalReconnectFit(
      session,
      { ...ctx, prefetchedParkModelSnapshot: {} },
      'ssh:builder@@pty-6',
      Promise.resolve(true)
    )
    notifyTerminalReconnectFit(
      session,
      { ...ctx, isCurrentReattachPayload: () => false },
      'ssh:builder@@pty-6',
      Promise.resolve(true)
    )
    await Promise.resolve()
    expect(seen).toEqual([
      { ptyId: 'ssh:builder@@pty-6', cols: 120, rows: 24, restoredFromModel: false, visible: true },
      {
        ptyId: 'ssh:builder@@pty-6',
        cols: 120,
        rows: 24,
        restoredFromModel: false,
        visible: false
      },
      { ptyId: 'ssh:builder@@pty-6', cols: 120, rows: 24, restoredFromModel: true, visible: true }
    ])
  })

  it('reports a visible resume only for a pane with a pty', () => {
    const seen: TerminalPaneShownInfo[] = []
    registerTerminalPaneShownHook((info) => seen.push(info))
    notifyTerminalPaneShown(pane(90))
    notifyTerminalPaneShown(pane(90, null))
    expect(seen).toEqual([{ ptyId: 'ssh:builder@@pty-6', cols: 90, rows: 24 }])
  })
})
