import { useState, useSyncExternalStore } from 'react'
import type { AiVaultScope } from '../../../../shared/ai-vault-types'
import { DEFAULT_AI_VAULT_SCOPE } from './ai-vault-scope-state'

export const MAX_COLLAPSED_GROUPS = 512

type AiVaultPanelTransientState = {
  preferredScope: AiVaultScope
  collapsedGroups: ReadonlySet<string>
}

function toggleCollapsedGroup(current: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(current)
  if (next.has(key)) {
    next.delete(key)
    return next
  }
  next.add(key)
  const oldest = next.values().next().value
  if (next.size > MAX_COLLAPSED_GROUPS && oldest !== undefined) {
    next.delete(oldest)
  }
  return next
}

function createPanelState() {
  let snapshot: AiVaultPanelTransientState = {
    preferredScope: DEFAULT_AI_VAULT_SCOPE,
    collapsedGroups: new Set()
  }
  const listeners = new Set<() => void>()
  const update = (next: AiVaultPanelTransientState): void => {
    snapshot = next
    for (const listener of listeners) {
      listener()
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    selectScope: (preferredScope: AiVaultScope) => {
      if (snapshot.preferredScope !== preferredScope) {
        update({ ...snapshot, preferredScope })
      }
    },
    toggleGroup: (key: string) =>
      update({ ...snapshot, collapsedGroups: toggleCollapsedGroup(snapshot.collapsedGroups, key) }),
    // fork：布局效果里一次换掉整组折叠键。渲染过程中不写。
    // 内容相同就跳过，以及上面的 512 条上限，都由调用方处理。
    setCollapsedGroups: (next: ReadonlySet<string>) => {
      update({ ...snapshot, collapsedGroups: new Set(next) })
    }
  }
}

// Sidebar navigation unmounts the panel; its choices last until this renderer reloads.
const sidebarState = createPanelState()

export function useAiVaultPanelTransientState(local = false) {
  const [state] = useState(() => (local ? createPanelState() : sidebarState))
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot)
  return {
    ...snapshot,
    selectScope: state.selectScope,
    toggleGroup: state.toggleGroup,
    setCollapsedGroups: state.setCollapsedGroups
  }
}
