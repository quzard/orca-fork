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

/** 隐藏标签的 RetainedPaneHost 是 display:none，并且带 inert / aria-hidden。标上之后切回去会一直灰。 */
function retainedHostIsHidden(host: HTMLElement): boolean {
  if (host.hasAttribute('inert') || host.getAttribute('aria-hidden') === 'true') {
    return true
  }
  if (host.style.display === 'none') {
    return true
  }
  const view = host.ownerDocument.defaultView
  return view?.getComputedStyle(host).display === 'none'
}

function addXtermsIn(scope: Element, cover: HTMLElement, found: Set<HTMLElement>): void {
  for (const node of scope.querySelectorAll<HTMLElement>('.xterm')) {
    if (!cover.contains(node)) {
      found.add(node)
    }
  }
}

/**
 * 终端聊天盖层在窗格里，只标这个 `.pane`。
 * 智能体会话盖层自己的宿主里没有 `.xterm`，终端在同组、同一工作区表面的兄弟宿主里。
 * 只标当前还显示着的兄弟；display:none 的其他标签留在 DOM 里，不能打标。
 */
function coveredXterms(
  cover: HTMLElement,
  terminalElement: HTMLElement | null | undefined
): HTMLElement[] {
  const found = new Set<HTMLElement>()
  const pane = cover.closest<HTMLElement>('.pane')
  if (pane) {
    // 已卸下的 terminal.element 不在窗格里，仍要标上；连在别的标签里的不能标。
    if (terminalElement && (!terminalElement.isConnected || pane.contains(terminalElement))) {
      found.add(terminalElement)
    }
    addXtermsIn(pane, cover, found)
    return [...found]
  }
  const host = cover.closest<HTMLElement>(RETAINED_PANE_HOST_SELECTOR)
  const group = host?.getAttribute(RETAINED_PANE_GROUP_ATTRIBUTE)
  if (!host || !group) {
    if (terminalElement && !terminalElement.isConnected) {
      found.add(terminalElement)
    }
    return [...found]
  }
  const surface = host.closest('[data-workspace-surface-id]')
  for (const other of host.ownerDocument.querySelectorAll<HTMLElement>(
    RETAINED_PANE_HOST_SELECTOR
  )) {
    if (other === host || other.getAttribute(RETAINED_PANE_GROUP_ATTRIBUTE) !== group) {
      continue
    }
    if (other.closest('[data-workspace-surface-id]') !== surface || retainedHostIsHidden(other)) {
      continue
    }
    addXtermsIn(other, cover, found)
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

/** 窗格盖层只观察自己的窗格。会话盖层只观察当前可见的同组兄弟宿主，不观察整块工作区。 */
function observationRoots(cover: HTMLElement): HTMLElement[] {
  const pane = cover.closest<HTMLElement>('.pane')
  if (pane) {
    return [pane]
  }
  const host = cover.closest<HTMLElement>(RETAINED_PANE_HOST_SELECTOR)
  const group = host?.getAttribute(RETAINED_PANE_GROUP_ATTRIBUTE)
  if (!host || !group) {
    return []
  }
  const surface = host.closest('[data-workspace-surface-id]')
  const roots: HTMLElement[] = []
  for (const other of host.ownerDocument.querySelectorAll<HTMLElement>(
    RETAINED_PANE_HOST_SELECTOR
  )) {
    if (other === host || other.getAttribute(RETAINED_PANE_GROUP_ATTRIBUTE) !== group) {
      continue
    }
    if (other.closest('[data-workspace-surface-id]') !== surface || retainedHostIsHidden(other)) {
      continue
    }
    roots.push(other)
  }
  return roots
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
