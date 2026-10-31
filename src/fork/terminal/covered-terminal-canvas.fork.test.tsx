// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { NativeChatPaneCover } from '../../renderer/src/components/terminal-pane/NativeChatPaneCover'
import { installCoveredTerminalCanvasStyle } from './covered-terminal-canvas'

type Pane = Pick<ManagedPane, 'container' | 'terminal'> & { canvas: HTMLCanvasElement }

// The DOM createPaneDOM and xterm's open() build: .pane > .xterm-container > .xterm > .xterm-screen.
function pane({ wrapped = true }: { wrapped?: boolean } = {}): Pane {
  const container = document.createElement('div')
  container.className = 'pane'
  const element = document.createElement('div')
  element.className = 'xterm'
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  const canvas = document.createElement('canvas')
  canvas.className = 'xterm-link-layer'
  screen.append(canvas)
  element.append(screen)
  if (wrapped) {
    const xtermContainer = document.createElement('div')
    xtermContainer.className = 'xterm-container'
    xtermContainer.append(element)
    container.append(xtermContainer)
  } else {
    container.append(element)
  }
  document.body.append(container)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the cover reads only element and focus.
  const terminal = { element, focus: () => undefined } as unknown as ManagedPane['terminal']
  return { container, terminal, canvas }
}

function cover(target: Pane, children: React.ReactNode = null): () => void {
  const view = render(
    createPortal(
      <NativeChatPaneCover pane={target}>{children}</NativeChatPaneCover>,
      target.container
    )
  )
  return view.unmount
}

const visibility = (element: Element): string => getComputedStyle(element).visibility
const pointerEvents = (element: Element): string => getComputedStyle(element).pointerEvents

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  document.head.replaceChildren()
})

describe('xterm canvases under a native chat cover', () => {
  it('hides the covered pane canvases and hit target until the cover goes away', () => {
    installCoveredTerminalCanvasStyle()
    const covered = pane()
    const uncover = cover(covered)
    expect(visibility(covered.canvas)).toBe('hidden')
    expect(pointerEvents(covered.canvas)).toBe('none')
    expect(pointerEvents(covered.terminal.element!)).toBe('none')
    // xterm recreates its canvases (WebGL attach, context loss) while the cover is up.
    const late = document.createElement('canvas')
    covered.terminal.element!.querySelector('.xterm-screen')!.append(late)
    expect(visibility(late)).toBe('hidden')
    uncover()
    expect(visibility(covered.canvas)).not.toBe('hidden')
    expect(pointerEvents(covered.terminal.element!)).not.toBe('none')
  })

  it('leaves split siblings and the chat content alone', () => {
    installCoveredTerminalCanvasStyle()
    const covered = pane()
    const sibling = pane()
    cover(
      covered,
      <div className="xterm">
        <canvas data-testid="chat-canvas" />
      </div>
    )
    expect(visibility(covered.canvas)).toBe('hidden')
    expect(visibility(sibling.canvas)).not.toBe('hidden')
    expect(visibility(document.querySelector('[data-testid="chat-canvas"]')!)).not.toBe('hidden')
  })

  it('also covers an xterm placed directly in the pane', () => {
    installCoveredTerminalCanvasStyle()
    const covered = pane({ wrapped: false })
    cover(covered)
    expect(visibility(covered.canvas)).toBe('hidden')
  })

  it('changes nothing until the renderer installs it, and installs once', () => {
    const covered = pane()
    cover(covered)
    expect(visibility(covered.canvas)).not.toBe('hidden')
    installCoveredTerminalCanvasStyle()
    installCoveredTerminalCanvasStyle()
    expect(document.head.querySelectorAll('style')).toHaveLength(1)
    expect(visibility(covered.canvas)).toBe('hidden')
  })
})
