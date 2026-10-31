import {
  SOURCE_CONTROL_ONLY_CHANGED_STORAGE_KEY,
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

// 只记非默认的「工作区仓库」。切回当前仓库就删掉这一条，删掉的工作区不会一直留在表里。
export function writeSourceControlScope(worktreeId: string, scope: SourceControlScope): void {
  const others = Object.entries(readMap()).filter(([id]) => id !== worktreeId)
  const next = Object.fromEntries(
    scope === SOURCE_CONTROL_SCOPE_WORKSPACE ? [...others, [worktreeId, scope]] : others
  )
  try {
    if (Object.keys(next).length === 0) {
      localStorage.removeItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY)
    } else {
      localStorage.setItem(SOURCE_CONTROL_SCOPE_STORAGE_KEY, JSON.stringify(next))
    }
  } catch {
    // 写不进去时，这次会话里的选择仍然有效。
  }
}

// 整个面板一份，不按工作区分。缺省关。
export function readOnlyShowChanged(): boolean {
  try {
    return localStorage.getItem(SOURCE_CONTROL_ONLY_CHANGED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeOnlyShowChanged(value: boolean): void {
  try {
    localStorage.setItem(SOURCE_CONTROL_ONLY_CHANGED_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // 隐私模式写不进去时，这次会话里的开关状态仍然有效。
  }
}
