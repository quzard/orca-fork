import { useLayoutEffect, type RefObject } from 'react'
import type { Terminal } from '@xterm/xterm'
import { focusNativeChatPromptCard } from '../native-chat/use-native-chat-prompt-card-focus'

/**
 * 聊天盖住终端时打在 `.xterm` 上。terminal.css 用它把画布移出绘制和命中。
 * macOS 会把 WebGL 画布和 `.xterm-link-layer`（z-index: 2）合成到 z-10 的聊天盖层之上，
 * `inert` 停不住这层，elementFromPoint 仍会命中画布，转录既被 `#282c34` 挡住也选不中。
 */
export const NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE = 'data-native-chat-covered'

/** Commit focus to the visible chat cover before making xterm inert, preventing later terminal.focus from sending keys to a hidden agent. */
export function useCoveredTerminalFocusHandoff(
  coverRef: RefObject<HTMLElement | null>,
  terminal: Pick<Terminal, 'element' | 'focus'>
): void {
  useLayoutEffect(() => {
    const cover = coverRef.current
    const terminalElement = terminal.element
    if (!cover || !terminalElement) {
      return
    }
    const ownerDocument = cover.ownerDocument
    // Focus first: making a focused element inert drops focus to <body>.
    if (terminalElement.contains(ownerDocument.activeElement)) {
      if (!focusNativeChatPromptCard(cover, null)) {
        cover.focus({ preventScroll: true })
      }
    }
    terminalElement.inert = true
    // 属性选择器盖住后创建的画布；xterm 改画布尺寸时不会清掉它。
    terminalElement.setAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE, '')
    return () => {
      terminalElement.inert = false
      terminalElement.removeAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)
      // Unmount cleanup runs before React detaches the cover, so this still sees chat focus.
      if (cover.contains(ownerDocument.activeElement)) {
        terminal.focus()
      }
    }
  }, [coverRef, terminal])
}
