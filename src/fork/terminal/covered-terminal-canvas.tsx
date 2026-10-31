// fork (F050): macOS composites xterm's WebGL canvas and its z-index 2 link layer above the z-10
// native chat cover, so a cleared terminal paints over the transcript and elementFromPoint hits the
// canvas; `inert` on the xterm does not stop either. While a chat cover is a child of a pane, the
// xterm beside it (not one inside the cover) is out of hit testing and its canvases are hidden.
// `visibility` keeps their layout boxes, so the hidden-canvas release does not drop the WebGL
// backing. A pure selector also covers canvases created after the cover, an xterm that opens
// later, and the cover unmounting, with no observer on the pane's DOM-renderer churn.

const COVERED_PANE = '.pane:has(> .native-chat-pane-shell)'

function coveredXterm(suffix: string): string {
  return `${COVERED_PANE} > .xterm${suffix}, ${COVERED_PANE} > :not(.native-chat-pane-shell) .xterm${suffix}`
}

export const COVERED_TERMINAL_CANVAS_CSS = `${coveredXterm('')} { pointer-events: none; }
${coveredXterm(' canvas')} { visibility: hidden; pointer-events: none; }`

const STYLE_ATTRIBUTE = 'data-fork-covered-terminal-canvas'

/** No document (renderer modules registered under node, as some tests do) means nothing to style. */
export function installCoveredTerminalCanvasStyle(
  doc: Document | undefined = globalThis.document
): void {
  if (!doc || doc.head.querySelector(`style[${STYLE_ATTRIBUTE}]`)) {
    return
  }
  const style = doc.createElement('style')
  style.setAttribute(STYLE_ATTRIBUTE, '')
  style.textContent = COVERED_TERMINAL_CANVAS_CSS
  doc.head.append(style)
}
