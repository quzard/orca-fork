import { registerCoveredTerminalGroups } from '../../shared/fork-hooks/covered-terminal-group'

// fork (F050): macOS composites xterm's WebGL canvas and its z-index 2 link layer above the z-10
// native chat cover, so a cleared terminal paints over the transcript and elementFromPoint hits the
// canvas; `inert` on the xterm does not stop either. While a chat cover is a child of a pane, the
// xterm beside it (not one inside the cover) is out of hit testing and its canvases are hidden.
// 智能体会话（含历史转录）不进 .pane，而是另一只 RetainedPaneHost，和终端宿主并列。
// 盖层可见时，同一分栏组里其他宿主的 xterm 同样藏起来，包括已经 display:none / inert 的：
// 隐藏宿主上的 WebGL 层仍可能画在转录上面。盖层变成 inert 后选择器不再命中，切回终端不会一直灰。
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

// 宿主是 fragment 的直接子节点，所以用父元素的 > 而不是整页扫描。
const VISIBLE_AGENT_HOST =
  '[data-retained-pane-host][data-retained-pane-group="GROUP"][data-structured-agent-session-overlay-tab-id]:not([inert])'
const COVERED_SIBLING_HOST =
  '[data-retained-pane-host][data-retained-pane-group="GROUP"]:not([data-structured-agent-session-overlay-tab-id])'

const notedGroups = new Set<string>()

function styleElement(doc: Document | undefined): HTMLStyleElement | null {
  return doc?.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTRIBUTE}]`) ?? null
}

function escapeGroup(groupId: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(groupId)
    : groupId
}

/** 同一分栏组、盖层还看得见时，旁边宿主里的 xterm 不接收命中，画布不画出来。 */
function groupRule(groupId: string): string {
  const group = escapeGroup(groupId)
  const cover = `:has(> ${VISIBLE_AGENT_HOST.replaceAll('GROUP', group)})`
  const host = `> ${COVERED_SIBLING_HOST.replaceAll('GROUP', group)}`
  return `${cover} ${host} .xterm { pointer-events: none; }
${cover} ${host} .xterm canvas { visibility: hidden; pointer-events: none; }`
}

function appendGroupRule(doc: Document, groupId: string): void {
  const style = styleElement(doc)
  if (!style || style.textContent?.includes(groupRule(groupId))) {
    return
  }
  style.textContent = `${style.textContent}\n${groupRule(groupId)}`
}

/** 分栏组第一次出现时补一条规则。样式表还没装上就先记着，安装时一并写入。 */
export function noteCoveredTerminalGroup(
  groupId: string,
  doc: Document | undefined = globalThis.document
): void {
  if (!groupId || notedGroups.has(groupId)) {
    if (groupId && doc) {
      appendGroupRule(doc, groupId)
    }
    return
  }
  notedGroups.add(groupId)
  if (doc) {
    appendGroupRule(doc, groupId)
  }
}

export function registerCoveredTerminalGroupRules(): void {
  registerCoveredTerminalGroups((groupId) => noteCoveredTerminalGroup(groupId))
}

/** No document (renderer modules registered under node, as some tests do) means nothing to style. */
export function installCoveredTerminalCanvasStyle(
  doc: Document | undefined = globalThis.document
): void {
  if (!doc) {
    return
  }
  let style = styleElement(doc)
  if (!style) {
    style = doc.createElement('style')
    style.setAttribute(STYLE_ATTRIBUTE, '')
    style.textContent = COVERED_TERMINAL_CANVAS_CSS
    doc.head.append(style)
  }
  for (const groupId of notedGroups) {
    appendGroupRule(doc, groupId)
  }
}

export function resetCoveredTerminalGroupRulesForTests(): void {
  notedGroups.clear()
}
