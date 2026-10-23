// 终端链接留下的标签要在重启后仍从原主机路径读取，且不能写进上游的 OpenFile 结构。
// 按文件 id 存在本机 localStorage；标签关掉就删。未登记钩子时上游碰不到这份记录。
import type {
  TerminalFileLinkHostRead,
  TerminalFileLinkStay
} from '../../shared/fork-hooks/terminal-file-link-workspace'

const STORAGE_KEY = 'orca.fork.terminal-file-link-stay'

type StoredStay = {
  readWorktreeId?: string
  readRelativePath?: string
}

type StayMap = Record<string, StoredStay>

let cache: StayMap | null = null

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readStoredMap(value: unknown): StayMap {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const map: StayMap = {}
  for (const [fileId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const readWorktreeId =
      'readWorktreeId' in entry && typeof entry.readWorktreeId === 'string'
        ? entry.readWorktreeId
        : undefined
    const readRelativePath =
      'readRelativePath' in entry && typeof entry.readRelativePath === 'string'
        ? entry.readRelativePath
        : undefined
    map[fileId] = { readWorktreeId, readRelativePath }
  }
  return map
}

function load(): StayMap {
  if (cache) {
    return cache
  }
  const raw = browserStorage()?.getItem(STORAGE_KEY)
  if (!raw) {
    cache = {}
    return cache
  }
  try {
    cache = readStoredMap(JSON.parse(raw))
  } catch {
    cache = {}
  }
  return cache
}

function persist(map: StayMap): void {
  cache = map
  browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function saveTerminalFileLinkStay(
  fileId: string,
  hostRead: TerminalFileLinkHostRead | null
): void {
  const map = load()
  map[fileId] = hostRead
    ? { readWorktreeId: hostRead.worktreeId, readRelativePath: hostRead.relativePath }
    : {}
  persist(map)
}

export function loadTerminalFileLinkStay(fileId: string): TerminalFileLinkStay | null {
  const entry = load()[fileId]
  if (!entry) {
    return null
  }
  if (entry.readWorktreeId && entry.readRelativePath) {
    return {
      read: { worktreeId: entry.readWorktreeId, relativePath: entry.readRelativePath }
    }
  }
  return { read: null }
}

export function forgetTerminalFileLinkStay(fileId: string): void {
  const map = load()
  if (!(fileId in map)) {
    return
  }
  delete map[fileId]
  persist(map)
}

/** 只删这一轮从打开变成关闭的 id，避免会话还没恢复时把重启后的记录清掉。 */
export function forgetClosedTerminalFileLinkStays(
  previouslyOpen: ReadonlySet<string>,
  currentlyOpen: ReadonlySet<string>
): void {
  for (const fileId of previouslyOpen) {
    if (!currentlyOpen.has(fileId)) {
      forgetTerminalFileLinkStay(fileId)
    }
  }
}

export function resetTerminalFileLinkStayCacheForTests(): void {
  cache = null
}
