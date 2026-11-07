import { useSyncExternalStore } from 'react'
import { emptyRequirementSession, type RequirementSession } from './overview-session'

const STORAGE_KEY = 'orca.requirementPreview.overview'
const listeners = new Set<() => void>()

function readStoredUi(): RequirementSession['uiByRequirement'] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('uiByRequirement' in parsed)) {
      return {}
    }
    const stored = parsed.uiByRequirement
    if (typeof stored !== 'object' || stored === null) {
      return {}
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the preview writes this record itself; a bad value only drops overview chrome.
    return stored as RequirementSession['uiByRequirement']
  } catch {
    return {}
  }
}

let session: RequirementSession = {
  ...emptyRequirementSession(),
  uiByRequirement: readStoredUi()
}

function publish(next: RequirementSession): void {
  session = next
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ uiByRequirement: next.uiByRequirement })
    )
  } catch {
    // 概览筛选存在内存里即可，写不进本地存储不影响工作区。
  }
  for (const listener of listeners) {
    listener()
  }
}

export function getRequirementSession(): RequirementSession {
  return session
}

export function updateRequirementSession(
  next: RequirementSession | ((current: RequirementSession) => RequirementSession)
): void {
  publish(typeof next === 'function' ? next(session) : next)
}

export function subscribeRequirementSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRequirementSession(): RequirementSession {
  return useSyncExternalStore(
    subscribeRequirementSession,
    getRequirementSession,
    getRequirementSession
  )
}
