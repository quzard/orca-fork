import { describe, expect, it } from 'vitest'
import {
  isForkTuiRepaintActive,
  setForkTuiRepaintActive
} from '../../shared/fork-hooks/terminal-lifecycle'
import {
  holdResizeForTuiPulse,
  pulseSshReconnectTui,
  consumeDeferredSshReconnectTui
} from './reconnect-tui-pulse'

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

describe('holdResizeForTuiPulse', () => {
  it('suppresses a fitted resize only while that pty is pulsing', () => {
    let fitted = false
    const getPtyId = (): string | null => 'ssh:builder@@pty-3'
    let shouldSuppressDesktopPtyResize = (): boolean => fitted
    shouldSuppressDesktopPtyResize = holdResizeForTuiPulse(getPtyId, shouldSuppressDesktopPtyResize)
    expect(shouldSuppressDesktopPtyResize()).toBe(false)
    setForkTuiRepaintActive('ssh:builder@@pty-3', true)
    expect(shouldSuppressDesktopPtyResize()).toBe(true)
    setForkTuiRepaintActive('ssh:builder@@pty-3', false)
    expect(shouldSuppressDesktopPtyResize()).toBe(false)
    fitted = true
    expect(shouldSuppressDesktopPtyResize()).toBe(true)
  })
})
