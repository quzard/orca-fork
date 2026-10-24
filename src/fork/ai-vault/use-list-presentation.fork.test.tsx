// @vitest-environment happy-dom
// 侧栏（rememberSeenGroups）和对话框（本地见过集合）都要覆盖：
// 新分组首帧收起、展开后重挂载、后出现的分组、全部收起、StrictMode，以及已收起但还没见过的分组。
import { StrictMode, useCallback, useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import {
  registerAiVaultCollapseNewGroups,
  requestAiVaultCollapseAll,
  resetAiVaultForkHooksForTests
} from '../../shared/fork-hooks/ai-vault'
import type { AiVaultSessionListGroup } from '../../renderer/src/components/right-sidebar/ai-vault-session-filters'
import { MAX_COLLAPSED_GROUPS } from '../../renderer/src/components/right-sidebar/ai-vault-panel-transient-state'
import { resetForkAiVaultSeenGroupsForTests, useForkAiVaultGroups } from './use-list-presentation'

const modes = [
  { rememberSeenGroups: false, label: 'dialog' },
  { rememberSeenGroups: true, label: 'sidebar' }
] as const

function group(key: string, label: string | null = key): AiVaultSessionListGroup {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook only reads executionHostId.
  const session = { executionHostId: LOCAL_EXECUTION_HOST_ID } as AiVaultSession
  return { key, label, sessions: [session] }
}

function useList(props: {
  groups: readonly AiVaultSessionListGroup[]
  rememberSeenGroups: boolean
  initialCollapsed?: ReadonlySet<string>
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(props.initialCollapsed)
  )
  // 与上游 store 一样：传入的集合直接换上，内容相同也不在这里拦截。
  const replaceCollapsedGroups = useCallback((next: Set<string>) => {
    setCollapsedGroups(next)
  }, [])
  const presented = useForkAiVaultGroups(props.groups, collapsedGroups, replaceCollapsedGroups, {
    loading: false,
    sessionCount: 0,
    rememberSeenGroups: props.rememberSeenGroups
  })
  const toggle = (key: string): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }
  return { collapsedGroups, presented, toggle }
}

describe('useForkAiVaultGroups', () => {
  beforeEach(() => {
    resetAiVaultForkHooksForTests()
    resetForkAiVaultSeenGroupsForTests()
    registerAiVaultCollapseNewGroups(true)
  })

  afterEach(() => {
    cleanup()
    resetAiVaultForkHooksForTests()
    resetForkAiVaultSeenGroupsForTests()
  })

  it.each(modes)(
    'collapses a new group on the first frame and writes it back ($label)',
    ({ rememberSeenGroups }) => {
      const groups = [group('a'), group('flat', null)]
      const frames: boolean[] = []
      const { result } = renderHook(() => {
        const view = useList({ groups, rememberSeenGroups })
        frames.push(view.presented.collapsedGroups.has('a'))
        return view
      })
      expect(frames[0]).toBe(true)
      expect(result.current.presented.collapsedGroups.has('flat')).toBe(false)
      expect(result.current.collapsedGroups.has('a')).toBe(true)
      expect(result.current.collapsedGroups.has('flat')).toBe(false)
    }
  )

  it('keeps a group the user expanded after remount when seen groups are remembered', () => {
    const groups = [group('a'), group('b')]
    const first = renderHook(() => useList({ groups, rememberSeenGroups: true }))
    expect(first.result.current.collapsedGroups.has('a')).toBe(true)
    act(() => first.result.current.toggle('a'))
    expect(first.result.current.collapsedGroups.has('a')).toBe(false)
    first.unmount()

    const second = renderHook(() => useList({ groups, rememberSeenGroups: true }))
    expect(second.result.current.collapsedGroups.has('a')).toBe(false)
    expect(second.result.current.presented.collapsedGroups.has('a')).toBe(false)
  })

  it('collapses an expanded group again after remount when seen groups are not remembered', () => {
    const groups = [group('a')]
    const first = renderHook(() => useList({ groups, rememberSeenGroups: false }))
    act(() => first.result.current.toggle('a'))
    expect(first.result.current.collapsedGroups.has('a')).toBe(false)
    first.unmount()

    const second = renderHook(() => useList({ groups, rememberSeenGroups: false }))
    expect(second.result.current.collapsedGroups.has('a')).toBe(true)
  })

  it.each(modes)(
    'collapses a group that appears later and leaves an expanded group alone ($label)',
    ({ rememberSeenGroups }) => {
      const { result, rerender } = renderHook(
        (props: { groups: readonly AiVaultSessionListGroup[] }) =>
          useList({ groups: props.groups, rememberSeenGroups }),
        { initialProps: { groups: [group('a'), group('b')] } }
      )
      act(() => result.current.toggle('a'))
      expect(result.current.collapsedGroups.has('a')).toBe(false)
      expect(result.current.collapsedGroups.has('b')).toBe(true)

      rerender({ groups: [group('a'), group('b'), group('c')] })
      expect(result.current.collapsedGroups.has('a')).toBe(false)
      expect(result.current.collapsedGroups.has('b')).toBe(true)
      expect(result.current.collapsedGroups.has('c')).toBe(true)
    }
  )

  it.each(modes)(
    'collapse-all then expanding one group sticks ($label)',
    ({ rememberSeenGroups }) => {
      const { result } = renderHook(() =>
        useList({ groups: [group('a'), group('b')], rememberSeenGroups })
      )
      act(() => {
        result.current.toggle('a')
        result.current.toggle('b')
      })
      expect(result.current.collapsedGroups.size).toBe(0)

      act(() => requestAiVaultCollapseAll())
      expect(result.current.collapsedGroups.has('a')).toBe(true)
      expect(result.current.collapsedGroups.has('b')).toBe(true)

      act(() => result.current.toggle('a'))
      expect(result.current.collapsedGroups.has('a')).toBe(false)
      expect(result.current.collapsedGroups.has('b')).toBe(true)
    }
  )

  it.each(modes)('does not loop under StrictMode ($label)', ({ rememberSeenGroups }) => {
    const renders = { count: 0 }
    const { result } = renderHook(
      () => {
        renders.count += 1
        return useList({ groups: [group('a'), group('b')], rememberSeenGroups })
      },
      { wrapper: StrictMode }
    )
    expect(renders.count).toBeLessThan(25)
    expect(result.current.collapsedGroups.has('a')).toBe(true)
    expect(result.current.collapsedGroups.has('b')).toBe(true)
  })

  it.each(modes)(
    'keeps a collapsed unseen group collapsed and lets the first expand stick ($label)',
    ({ rememberSeenGroups }) => {
      const renders = { count: 0 }
      const { result } = renderHook(() => {
        renders.count += 1
        return useList({
          groups: [group('a')],
          rememberSeenGroups,
          initialCollapsed: new Set(['a'])
        })
      })
      expect(renders.count).toBeLessThan(25)
      expect(result.current.collapsedGroups.has('a')).toBe(true)
      act(() => result.current.toggle('a'))
      expect(result.current.collapsedGroups.has('a')).toBe(false)
      expect(result.current.presented.collapsedGroups.has('a')).toBe(false)
    }
  )

  it.each(modes)(
    'caps a whole-set replace at the collapsed-group limit and settles ($label)',
    ({ rememberSeenGroups }) => {
      expect(MAX_COLLAPSED_GROUPS).toBe(512)
      const groups = Array.from({ length: MAX_COLLAPSED_GROUPS + 1 }, (_, index) =>
        group(`g${index}`)
      )
      const renders = { count: 0 }
      const { result } = renderHook(() => {
        renders.count += 1
        return useList({ groups, rememberSeenGroups })
      })
      expect(renders.count).toBeLessThan(25)
      expect(result.current.collapsedGroups.size).toBe(MAX_COLLAPSED_GROUPS)
      expect(result.current.collapsedGroups.has('g0')).toBe(false)
      expect(result.current.collapsedGroups.has(`g${MAX_COLLAPSED_GROUPS}`)).toBe(true)
      expect(result.current.presented.collapsedGroups.has('g0')).toBe(false)
    }
  )

  it.each(modes)(
    'drops seen groups that no longer fit so a returning group collapses again ($label)',
    ({ rememberSeenGroups }) => {
      const first = Array.from({ length: MAX_COLLAPSED_GROUPS }, (_, index) => group(`a${index}`))
      const second = Array.from({ length: MAX_COLLAPSED_GROUPS }, (_, index) => group(`b${index}`))
      const { result, rerender } = renderHook(
        (props: { groups: readonly AiVaultSessionListGroup[] }) =>
          useList({ groups: props.groups, rememberSeenGroups }),
        { initialProps: { groups: first } }
      )
      expect(result.current.collapsedGroups.size).toBe(MAX_COLLAPSED_GROUPS)

      rerender({ groups: second })
      expect(result.current.collapsedGroups.has('b0')).toBe(true)
      expect(result.current.collapsedGroups.has('a0')).toBe(false)

      rerender({ groups: [group('a0')] })
      expect(result.current.collapsedGroups.has('a0')).toBe(true)
    }
  )
})
