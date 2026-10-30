import { useLayoutEffect, type RefObject } from 'react'
import type { Terminal } from '@xterm/xterm'
import { focusNativeChatPromptCard } from '../native-chat/use-native-chat-prompt-card-focus'

/**
 * 聊天盖住终端时打在 `.xterm` 上。terminal.css 用它把画布移出绘制和命中。
 * macOS 会把 WebGL 画布和 `.xterm-link-layer`（z-index: 2）合成到 z-10 的聊天盖层之上，
 * `inert` 停不住这层，elementFromPoint 仍会命中画布，转录既被挡住也选不中。
 */
export const NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE = 'data-native-chat-covered'

const RETAINED_PANE_HOST_SELECTOR = '[data-retained-pane-host]'

/**
 * 只藏这一层盖住的终端。同一分栏组里别的标签也挂着 RetainedPaneHost，
 * 按组 id 或整块工作区去扫会把那些标签的分屏终端画布一起藏掉。
 * 盖层在窗格里就只看这个 `.pane`；智能体会话盖层不在窗格里，就只看它自己的宿主。
 */
function coverScope(cover: HTMLElement): HTMLElement | null {
  return (
    cover.closest<HTMLElement>('.pane') ?? cover.closest<HTMLElement>(RETAINED_PANE_HOST_SELECTOR)
  )
}

function coveredXterms(
  cover: HTMLElement,
  terminalElement: HTMLElement | null | undefined
): HTMLElement[] {
  const found = new Set<HTMLElement>()
  const scope = coverScope(cover)
  // 已卸下的 terminal.element 不在窗格里，仍要标上；连在别的标签里的不能标。
  if (
    terminalElement &&
    (!terminalElement.isConnected || (scope !== null && scope.contains(terminalElement)))
  ) {
    found.add(terminalElement)
  }
  if (scope) {
    for (const node of scope.querySelectorAll<HTMLElement>('.xterm')) {
      if (!cover.contains(node)) {
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

// 终端聊天盖层和智能体会话盖层会盖住同一棵 .xterm。谁先卸下都不能清掉另一个还在用的标记。
const holdersByElement = new WeakMap<HTMLElement, Set<symbol>>()

function holdCoveredXterm(
  element: HTMLElement,
  holder: symbol,
  cover: HTMLElement,
  ownerDocument: Document
): void {
  let holders = holdersByElement.get(element)
  if (!holders) {
    holders = new Set()
    holdersByElement.set(element, holders)
  }
  if (!holders.has(holder) && element.contains(ownerDocument.activeElement)) {
    // 先把焦点交出去，再 inert，否则焦点会掉到 body。
    if (!focusNativeChatPromptCard(cover, null)) {
      cover.focus({ preventScroll: true })
    }
  }
  holders.add(holder)
  element.inert = true
  // 属性选择器盖住后创建的画布；xterm 改画布尺寸时不会清掉它。
  element.setAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE, '')
}

function releaseCoveredXterm(element: HTMLElement, holder: symbol): void {
  const holders = holdersByElement.get(element)
  if (!holders?.delete(holder)) {
    return
  }
  if (holders.size > 0) {
    return
  }
  holdersByElement.delete(element)
  element.inert = false
  element.removeAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)
}

/** 只观察这一层自己的窗格或宿主，后挂上的 .xterm 才能补标，又不会看见别的标签。 */
function observationRoots(cover: HTMLElement): HTMLElement[] {
  const scope = coverScope(cover)
  return scope ? [scope] : []
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
    const holder = Symbol()
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
        marked.delete(element)
        releaseCoveredXterm(element, holder)
      }
      for (const element of next) {
        if (marked.has(element)) {
          continue
        }
        holdCoveredXterm(element, holder, cover, ownerDocument)
        marked.add(element)
      }
    }
    sync()
    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((records) => {
            if (marksAddedXterm(records)) {
              sync()
            }
          })
    if (observer) {
      for (const root of observationRoots(cover)) {
        observer.observe(root, { childList: true, subtree: true })
      }
    }
    return () => {
      disposed = true
      observer?.disconnect()
      for (const element of marked) {
        releaseCoveredXterm(element, holder)
      }
      // Unmount cleanup runs before React detaches the cover, so this still sees chat focus.
      if (terminal && cover.contains(ownerDocument.activeElement)) {
        terminal.focus()
      }
    }
  }, [active, coverRef, terminal])
}
