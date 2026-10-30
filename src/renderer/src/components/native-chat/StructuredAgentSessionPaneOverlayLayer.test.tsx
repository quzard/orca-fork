// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETAINED_PANE_GROUP_ATTRIBUTE } from '../tab-group/tab-group-body-anchor'
import { UNFOCUSED_SPLIT_GROUP_OPACITY } from '../tab-group/split-group-dim'
import { NativeChatPaneCover } from '../terminal-pane/NativeChatPaneCover'
import { NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE } from '../terminal-pane/use-covered-terminal-focus-handoff'
import type { Tab, TabGroup } from '../../../../shared/tab-types'

type MockAppState = {
  unifiedTabsByWorktree: Record<string, readonly Tab[]>
  groupsByWorktree: Record<string, readonly TabGroup[]>
  activeGroupIdByWorktree: Record<string, string>
  runtimeEnvironmentId: string | null
  focusGroup: (worktreeId: string, groupId: string) => void
}

const mocks = vi.hoisted(() => ({
  store: null as null | { setState: (state: Partial<MockAppState>) => void },
  focusGroup: vi.fn(),
  mountsByTabId: new Map<string, number>(),
  unmountsByTabId: new Map<string, number>(),
  groupIdByTabId: new Map<string, string | undefined>(),
  targetByTabId: new Map<string, unknown>()
}))

vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  const useAppStore = create<MockAppState>(() => ({
    unifiedTabsByWorktree: {},
    groupsByWorktree: {},
    activeGroupIdByWorktree: {},
    runtimeEnvironmentId: null,
    focusGroup: mocks.focusGroup
  }))
  mocks.store = useAppStore
  return { useAppStore }
})

vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: (state: MockAppState) =>
    state.runtimeEnvironmentId ? `runtime:${state.runtimeEnvironmentId}` : 'local'
}))

vi.mock('./NativeChatView', async () => {
  const { useEffect } = await import('react')
  return {
    default: function MockNativeChatView({
      tabId,
      groupId,
      isVisible,
      isFocusedGroup,
      target
    }: {
      tabId: string
      groupId?: string
      isVisible: boolean
      isFocusedGroup: boolean
      target: unknown
    }) {
      mocks.groupIdByTabId.set(tabId, groupId)
      mocks.targetByTabId.set(tabId, target)
      useEffect(() => {
        mocks.mountsByTabId.set(tabId, (mocks.mountsByTabId.get(tabId) ?? 0) + 1)
        return () => {
          mocks.unmountsByTabId.set(tabId, (mocks.unmountsByTabId.get(tabId) ?? 0) + 1)
        }
      }, [tabId])
      return (
        <span
          data-chat-tab-id={tabId}
          data-chat-visible={String(isVisible)}
          data-chat-focused-group={String(isFocusedGroup)}
          data-native-chat-working="true"
        />
      )
    }
  }
})

import StructuredAgentSessionPaneOverlayLayer from './StructuredAgentSessionPaneOverlayLayer'

const WORKTREE_ID = 'wt-1'
const GROUP_ID = 'group-1'
const SECOND_GROUP_ID = 'group-2'
const FIRST_TAB_ID = 'structured-agent-session-session-1'
const SECOND_TAB_ID = 'structured-agent-session-session-2'

describe('StructuredAgentSessionPaneOverlayLayer', () => {
  beforeEach(() => {
    mocks.focusGroup.mockClear()
    mocks.mountsByTabId.clear()
    mocks.unmountsByTabId.clear()
    mocks.groupIdByTabId.clear()
    mocks.targetByTabId.clear()
    mocks.store?.setState(createState(FIRST_TAB_ID))
  })

  afterEach(cleanup)

  // Two hosts can publish the same workspace id; each tab records which one holds its chat.
  it('reads each chat from the host recorded on its tab, not its workspace', () => {
    const state = createState(FIRST_TAB_ID)
    const [first, second] = state.unifiedTabsByWorktree[WORKTREE_ID]!
    mocks.store?.setState({
      unifiedTabsByWorktree: {
        [WORKTREE_ID]: [{ ...first!, executionHostId: 'runtime:server-1' }, second!]
      }
    })
    render(<StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />)

    expect(mocks.targetByTabId.get(FIRST_TAB_ID)).toEqual({
      kind: 'environment',
      environmentId: 'server-1'
    })
    expect(mocks.targetByTabId.get(SECOND_TAB_ID)).toEqual({ kind: 'local' })
  })

  it('keeps materialized chat surfaces mounted while activation only swaps visibility', () => {
    const view = render(
      <StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />
    )
    const firstBefore = chatSurface(view.container, FIRST_TAB_ID)
    const secondBefore = chatSurface(view.container, SECOND_TAB_ID)

    expect(firstBefore.dataset.chatVisible).toBe('true')
    expect(secondBefore.dataset.chatVisible).toBe('false')
    expect(mocks.mountsByTabId).toEqual(
      new Map([
        [FIRST_TAB_ID, 1],
        [SECOND_TAB_ID, 1]
      ])
    )

    act(() => {
      mocks.store?.setState({
        groupsByWorktree: {
          [WORKTREE_ID]: [createGroup(SECOND_TAB_ID)]
        }
      })
    })

    const firstAfter = chatSurface(view.container, FIRST_TAB_ID)
    const secondAfter = chatSurface(view.container, SECOND_TAB_ID)
    expect(firstAfter).toBe(firstBefore)
    expect(secondAfter).toBe(secondBefore)
    expect(firstAfter.dataset.chatVisible).toBe('false')
    expect(secondAfter.dataset.chatVisible).toBe('true')
    expect(mocks.mountsByTabId.get(FIRST_TAB_ID)).toBe(1)
    expect(mocks.mountsByTabId.get(SECOND_TAB_ID)).toBe(1)
    expect(mocks.unmountsByTabId.size).toBe(0)
    expect(mocks.groupIdByTabId).toEqual(
      new Map([
        [FIRST_TAB_ID, GROUP_ID],
        [SECOND_TAB_ID, GROUP_ID]
      ])
    )
  })

  it('routes overlay interaction back to the owning split group', () => {
    const view = render(
      <StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />
    )
    const slot = view.container.querySelector<HTMLElement>(
      `[data-structured-agent-session-overlay-tab-id="${FIRST_TAB_ID}"]`
    )

    expect(slot).not.toBeNull()
    fireEvent.pointerDown(slot!)
    expect(mocks.focusGroup).toHaveBeenCalledWith(WORKTREE_ID, GROUP_ID)
  })

  it('keeps a working session at the base pane layer', () => {
    const view = render(
      <StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />
    )
    const slot = view.container.querySelector<HTMLElement>(
      `[data-structured-agent-session-overlay-tab-id="${FIRST_TAB_ID}"]`
    )

    expect(slot).not.toBeNull()
    expect(slot?.hasAttribute('data-retained-pane-host')).toBe(true)
    expect(slot?.classList.contains('isolate')).toBe(true)
    expect(slot?.classList.contains('overflow-hidden')).toBe(true)
    expect(slot?.classList.contains('z-10')).toBe(true)
    expect(slot?.style.zIndex).toBe('')
    expect(slot?.querySelector('[data-native-chat-working="true"]')).not.toBeNull()
  })

  it('marks only the focused split column as the focused group', () => {
    act(() => {
      mocks.store?.setState({
        unifiedTabsByWorktree: {
          [WORKTREE_ID]: [
            structuredTab(FIRST_TAB_ID, 'session-1', 0),
            { ...structuredTab(SECOND_TAB_ID, 'session-2', 1), groupId: SECOND_GROUP_ID }
          ]
        },
        groupsByWorktree: {
          [WORKTREE_ID]: [
            createGroup(FIRST_TAB_ID),
            {
              id: SECOND_GROUP_ID,
              worktreeId: WORKTREE_ID,
              activeTabId: SECOND_TAB_ID,
              tabOrder: [SECOND_TAB_ID]
            }
          ]
        },
        activeGroupIdByWorktree: { [WORKTREE_ID]: SECOND_GROUP_ID }
      })
    })
    const view = render(
      <StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />
    )

    // Both columns are revealed at once; only the focused one may take the caret.
    expect(chatSurface(view.container, FIRST_TAB_ID).dataset.chatVisible).toBe('true')
    expect(chatSurface(view.container, SECOND_TAB_ID).dataset.chatVisible).toBe('true')
    expect(chatSurface(view.container, FIRST_TAB_ID).dataset.chatFocusedGroup).toBe('false')
    expect(chatSurface(view.container, SECOND_TAB_ID).dataset.chatFocusedGroup).toBe('true')
    const host = (tabId: string): HTMLElement | null =>
      chatSurface(view.container, tabId).closest<HTMLElement>('[data-retained-pane-host]')
    const first = host(FIRST_TAB_ID)
    const second = host(SECOND_TAB_ID)
    const dim = String(UNFOCUSED_SPLIT_GROUP_OPACITY)
    expect(first?.style.opacity).toBe(dim)
    expect(second?.style.opacity).toBe('1')
    act(() => mocks.store?.setState({ activeGroupIdByWorktree: { [WORKTREE_ID]: GROUP_ID } }))
    expect(first?.style.opacity).toBe('1')
    expect(second?.style.opacity).toBe(dim)
  })

  it('marks same-group terminal canvases while the agent-session cover is visible', () => {
    const terminalHost = document.createElement('div')
    terminalHost.setAttribute('data-retained-pane-host', '')
    terminalHost.setAttribute(RETAINED_PANE_GROUP_ATTRIBUTE, GROUP_ID)
    const covered = document.createElement('div')
    covered.className = 'xterm'
    const linkLayer = document.createElement('canvas')
    linkLayer.className = 'xterm-link-layer'
    covered.append(linkLayer)
    terminalHost.append(covered)
    const otherGroup = document.createElement('div')
    otherGroup.setAttribute('data-retained-pane-host', '')
    otherGroup.setAttribute(RETAINED_PANE_GROUP_ATTRIBUTE, SECOND_GROUP_ID)
    const otherXterm = document.createElement('div')
    otherXterm.className = 'xterm'
    otherGroup.append(otherXterm)
    document.body.append(terminalHost, otherGroup)
    try {
      render(<StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />)
      expect(covered.getAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)).toBe('')
      expect(covered.inert).toBe(true)
      expect(linkLayer.closest('[data-native-chat-covered]')).toBe(covered)
      expect(otherXterm.hasAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)).toBe(false)

      act(() => {
        mocks.store?.setState({
          groupsByWorktree: { [WORKTREE_ID]: [createGroup('not-a-chat')] }
        })
      })
      expect(covered.hasAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)).toBe(false)
      expect(covered.inert).toBe(false)
    } finally {
      terminalHost.remove()
      otherGroup.remove()
    }
  })

  it('keeps the terminal marked when only the agent-session cover goes away', () => {
    const surface = document.createElement('div')
    surface.setAttribute('data-workspace-surface-id', WORKTREE_ID)
    const terminalHost = document.createElement('div')
    terminalHost.setAttribute('data-retained-pane-host', '')
    terminalHost.setAttribute(RETAINED_PANE_GROUP_ATTRIBUTE, GROUP_ID)
    const paneEl = document.createElement('div')
    paneEl.className = 'pane'
    const xterm = document.createElement('div')
    xterm.className = 'xterm'
    paneEl.append(xterm)
    terminalHost.append(paneEl)
    const reactRoot = document.createElement('div')
    surface.append(terminalHost, reactRoot)
    document.body.append(surface)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the cover reads container, element, and focus.
    const pane = {
      container: paneEl,
      terminal: { element: xterm, focus: () => {} }
    } as unknown as Parameters<typeof NativeChatPaneCover>[0]['pane']
    try {
      const view = render(
        <>
          {createPortal(<NativeChatPaneCover pane={pane}>{null}</NativeChatPaneCover>, paneEl)}
          <StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />
        </>,
        { container: reactRoot }
      )
      expect(xterm.getAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)).toBe('')
      expect(xterm.inert).toBe(true)

      act(() => {
        mocks.store?.setState({
          groupsByWorktree: { [WORKTREE_ID]: [createGroup('not-a-chat')] }
        })
      })
      expect(xterm.getAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)).toBe('')
      expect(xterm.inert).toBe(true)

      view.rerender(
        <StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />
      )
      expect(xterm.hasAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)).toBe(false)
      expect(xterm.inert).toBe(false)
    } finally {
      surface.remove()
    }
  })

  it('marks a same-group xterm that opens after the agent cover is visible', async () => {
    const surface = document.createElement('div')
    surface.setAttribute('data-workspace-surface-id', WORKTREE_ID)
    const reactRoot = document.createElement('div')
    surface.append(reactRoot)
    document.body.append(surface)
    try {
      render(<StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />, {
        container: reactRoot
      })
      const terminalHost = document.createElement('div')
      terminalHost.setAttribute('data-retained-pane-host', '')
      terminalHost.setAttribute(RETAINED_PANE_GROUP_ATTRIBUTE, GROUP_ID)
      surface.append(terminalHost)
      const xterm = document.createElement('div')
      xterm.className = 'xterm'
      const linkLayer = document.createElement('canvas')
      linkLayer.className = 'xterm-link-layer'
      xterm.append(linkLayer)
      terminalHost.append(xterm)
      await flushHappyDom()
      expect(xterm.getAttribute(NATIVE_CHAT_COVERED_TERMINAL_ATTRIBUTE)).toBe('')
      expect(xterm.inert).toBe(true)
      expect(linkLayer.closest('[data-native-chat-covered]')).toBe(xterm)
    } finally {
      surface.remove()
    }
  })

  it('marks no column as focused when the focused group id names nothing', () => {
    act(() => {
      mocks.store?.setState({ activeGroupIdByWorktree: { [WORKTREE_ID]: 'group-removed' } })
    })
    const view = render(
      <StructuredAgentSessionPaneOverlayLayer worktreeId={WORKTREE_ID} isWorktreeActive />
    )

    expect(chatSurface(view.container, FIRST_TAB_ID).dataset.chatVisible).toBe('true')
    expect(chatSurface(view.container, FIRST_TAB_ID).dataset.chatFocusedGroup).toBe('false')
  })
})

function flushHappyDom(): Promise<void> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: happy-dom's test window exposes this flush.
  return (
    window as unknown as { happyDOM: { waitUntilComplete: () => Promise<void> } }
  ).happyDOM.waitUntilComplete()
}

function createState(activeTabId: string): MockAppState {
  return {
    unifiedTabsByWorktree: {
      [WORKTREE_ID]: [
        structuredTab(FIRST_TAB_ID, 'session-1', 0),
        structuredTab(SECOND_TAB_ID, 'session-2', 1)
      ]
    },
    groupsByWorktree: { [WORKTREE_ID]: [createGroup(activeTabId)] },
    activeGroupIdByWorktree: { [WORKTREE_ID]: GROUP_ID },
    runtimeEnvironmentId: null,
    focusGroup: mocks.focusGroup
  }
}

function createGroup(activeTabId: string): TabGroup {
  return {
    id: GROUP_ID,
    worktreeId: WORKTREE_ID,
    activeTabId,
    tabOrder: [FIRST_TAB_ID, SECOND_TAB_ID]
  }
}

function structuredTab(id: string, sessionId: string, sortOrder: number): Tab {
  return {
    id,
    entityId: sessionId,
    groupId: GROUP_ID,
    worktreeId: WORKTREE_ID,
    contentType: 'agent-session',
    agentSessionAgent: 'codex',
    label: 'Codex Chat',
    customLabel: null,
    color: null,
    sortOrder,
    createdAt: sortOrder + 1
  }
}

function chatSurface(container: HTMLElement, tabId: string): HTMLElement {
  const surface = container.querySelector<HTMLElement>(`[data-chat-tab-id="${tabId}"]`)
  if (!surface) {
    throw new Error(`missing structured chat surface ${tabId}`)
  }
  return surface
}
