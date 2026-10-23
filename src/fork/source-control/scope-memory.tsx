import {
  SOURCE_CONTROL_SCOPE_CURRENT,
  SOURCE_CONTROL_SCOPE_STORAGE_KEY,
  SOURCE_CONTROL_SCOPE_WORKSPACE
} from '../git-workspace/constants'

export type SourceControlScope =
  | typeof SOURCE_CONTROL_SCOPE_CURRENT
  | typeof SOURCE_CONTROL_SCOPE_WORKSPACE

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const entries = Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export function readSourceControlScope(worktreeId: string): SourceControlScope {
  return readMap()[worktreeId] === SOURCE_CONTROL_SCOPE_WORKSPACE
    ? SOURCE_CONTROL_SCOPE_WORKSPACE
    : SOURCE_CONTROL_SCOPE_CURRENT
}

export function writeSourceControlScope(worktreeId: string, scope: SourceControlScope): void {
  const next = readMap()
  next[worktreeId] = scope
  localStorage.setItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY, JSON.stringify(next))
}
