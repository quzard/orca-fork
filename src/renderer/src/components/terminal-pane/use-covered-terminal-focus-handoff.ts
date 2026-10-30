import { useLayoutEffect, type RefObject } from 'react'
import type { Terminal } from '@xterm/xterm'
import { RETAINED_PANE_GROUP_ATTRIBUTE } from '../tab-group/tab-group-body-anchor'
import { focusNativeChatPromptCard } from '../native-chat/use-native-chat-prompt-card-focus'

/**
 * 聊天盖住终端时打在 `.xterm` 上。terminal.css 用它把画布移出绘制和命中。
 * macOS 会把 WebGL 画布和 `.xterm-link-layer`（z-index: 2）合成到 z-10 的聊天盖层之上，
 * `inert` 停不住这层，elementFromPoint 仍会命中画布，转录既被挡住也选不中。
 */
export const NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE = 'data-native-chat-covered'

const RETAINED_PANE_HOST_SELECTOR = '[data-retained-pane-host]'

/**
 * 要藏画布的 `.xterm`。
 * 终端聊天盖层挂在窗格里，但 `terminal.element` 可能还没 open，或指向已经卸下的节点，
 * 真正吃命中的 link-layer 在窗格里那棵连着的 `.xterm` 上。
 * 智能体会话盖层不进窗格，它和终端是同一组里叠放的两个 RetainedPaneHost，
 * 只标 `terminal.element` 时这棵画布的祖先上没有属性。
 */
function coveredXterms(
  cover: HTMLElement,
  terminalElement: HTMLElement | null | undefined
): HTMLElement[] {
  const found = new Set<HTMLElement>()
  if (terminalElement) {
    found.add(terminalElement)
  }
  const pane = cover.closest('.pane')
  if (pane) {
    for (const node of pane.querySelectorAll<HTMLElement>('.xterm')) {
      found.add(node)
    }
  }
  const host = cover.closest<HTMLElement>(RETAINED_PANE_HOST_SELECTOR)
  const group = host?.getAttribute(RETAINED_PANE_GROUP_ATTRIBUTE)
  if (host && group) {
    // 同一工作区表面才算叠在一起；分屏是另一组，不标。
    const surface = host.closest('[data-workspace-surface-id]')
    for (const other of host.ownerDocument.querySelectorAll<HTMLElement>(
      RETAINED_PANE_HOST_SELECTOR
    )) {
      if (other === host || other.getAttribute(RETAINED_PANE_GROUP_ATTRIBUTE) !== group) {
        continue
      }
      if (other.closest('[data-workspace-surface-id]') !== surface) {
        continue
      }
      for (const node of other.querySelectorAll<HTMLElement>('.xterm')) {
        found.add(node)
      }
    }
  }
  return [...found]
}

function marksAddedXterm(records: MutationRecord[]): boolean {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) {
        continue
      }
      if (node.classList.contains('xterm') || node.querySelector('.xterm') !== null) {
        return true
      }
    }
  }
  return false
}

/** Commit focus to the visible chat cover before making xterm inert, preventing later terminal.focus from sending keys to a hidden agent. */
export function useCoveredTerminalFocusHandoff(
  coverRef: RefObject<HTMLElement | null>,
  terminal: Pick<Terminal, 'element' | 'focus'> | null,
  active = true
): void {
  useLayoutEffect(() => {
    if (!active) {
      return
    }
    const cover = coverRef.current
    if (!cover) {
      return
    }
    const ownerDocument = cover.ownerDocument
    const marked = new Set<HTMLElement>()
    let disposed = false
    const sync = (): void => {
      if (disposed) {
        return
      }
      const next = new Set(coveredXterms(cover, terminal?.element))
      for (const element of marked) {
        if (next.has(element)) {
          continue
        }
        element.inert = false
        element.removeAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)
        marked.delete(element)
      }
      for (const element of next) {
        if (marked.has(element)) {
          continue
        }
        // 先把焦点交出去，再 inert，否则焦点会掉到 body。
        if (element.contains(ownerDocument.activeElement)) {
          if (!focusNativeChatPromptCard(cover, null)) {
            cover.focus({ preventScroll: true })
          }
        }
        element.inert = true
        // 属性选择器盖住后创建的画布；xterm 改画布尺寸时不会清掉它。
        element.setAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE, '')
        marked.add(element)
      }
    }
    sync()
    const pane = cover.closest('.pane')
    const observer =
      pane && typeof MutationObserver !== 'undefined'
        ? new MutationObserver((records) => {
            if (marksAddedXterm(records)) {
              sync()
            }
          })
        : null
    if (pane && observer) {
      observer.observe(pane, { childList: true, subtree: true })
    }
    return () => {
      disposed = true
      observer?.disconnect()
      for (const element of marked) {
        element.inert = false
        element.removeAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)
      }
      // Unmount cleanup runs before React detaches the cover, so this still sees chat focus.
      if (terminal && cover.contains(ownerDocument.activeElement)) {
        terminal.focus()
      }
    }
  }, [active, coverRef, terminal])
}
