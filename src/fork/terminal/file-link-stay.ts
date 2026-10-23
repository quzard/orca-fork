// 终端链接留下的标签按「工作区 + 路径」记在本机。文件 id 会随恢复顺序变化，路径不会。
// 只记有没有留下，读取时再向当前工作区列表要归属。未登记钩子时上游碰不到这份记录。

const STORAGE_KEY = 'orca.fork.terminal-file-link-stay'

type StayMap = Record<string, true>

type OpenPath = { worktreeId: string; filePath: string }

let cache: StayMap | null = null

export function terminalFileLinkStayKey(worktreeId: string, filePath: string): string {
  return `${worktreeId}\0${filePath}`
}

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
  for (const [key, entry] of Object.entries(value)) {
    if (entry) {
      map[key] = true
    }
  }
  return map
}

function parseStored(raw: string): StayMap {
  try {
    return readStoredMap(JSON.parse(raw))
  } catch {
    return {}
  }
}

function readDisk(): StayMap {
  const raw = browserStorage()?.getItem(STORAGE_KEY)
  return raw ? parseStored(raw) : {}
}

function load(): StayMap {
  if (!cache) {
    cache = readDisk()
  }
  return cache
}

/** 写入前重读，避免另一个网页标签页刚写过的记录被这份缓存盖掉。 */
function update(mutate: (map: StayMap) => boolean): void {
  const map = readDisk()
  if (!mutate(map)) {
    return
  }
  cache = map
  browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function applyTerminalFileLinkStayStorageEvent(
  key: string | null,
  value: string | null
): void {
  if (key !== STORAGE_KEY) {
    return
  }
  cache = value ? parseStored(value) : {}
}

export function saveTerminalFileLinkStay(worktreeId: string, filePath: string): void {
  const stayKey = terminalFileLinkStayKey(worktreeId, filePath)
  update((map) => {
    if (map[stayKey]) {
      return false
    }
    map[stayKey] = true
    return true
  })
}

export function loadTerminalFileLinkStay(worktreeId: string, filePath: string): boolean {
  return load()[terminalFileLinkStayKey(worktreeId, filePath)] === true
}

/** 已经打开的可编辑标签不会变成只读，这种情况下不记标记，避免下次按只读路径去读它。 */
export function rememberTerminalFileLinkStay(
  worktreeId: string,
  filePath: string,
  openFile: { readOnly?: boolean } | undefined
): void {
  if (openFile?.readOnly !== true) {
    return
  }
  saveTerminalFileLinkStay(worktreeId, filePath)
}

export function forgetTerminalFileLinkStay(worktreeId: string, filePath: string): void {
  const stayKey = terminalFileLinkStayKey(worktreeId, filePath)
  update((map) => {
    if (!map[stayKey]) {
      return false
    }
    delete map[stayKey]
    return true
  })
}

/** 只删这一轮从打开变成关闭的路径，避免会话还没恢复时把重启后的记录清掉。 */
export function forgetClosedTerminalFileLinkStays(
  previouslyOpen: readonly OpenPath[],
  currentlyOpen: readonly OpenPath[]
): void {
  const live = new Set(
    currentlyOpen.map((file) => terminalFileLinkStayKey(file.worktreeId, file.filePath))
  )
  for (const file of previouslyOpen) {
    if (!live.has(terminalFileLinkStayKey(file.worktreeId, file.filePath))) {
      forgetTerminalFileLinkStay(file.worktreeId, file.filePath)
    }
  }
}

/** 会话已经恢复之后，打开列表里没有的记录删掉（崩溃、工作区没了、恢复时工作区无效）。 */
export function pruneTerminalFileLinkStays(openFiles: readonly OpenPath[]): void {
  const live = new Set(
    openFiles.map((file) => terminalFileLinkStayKey(file.worktreeId, file.filePath))
  )
  update((map) => {
    let changed = false
    for (const key of Object.keys(map)) {
      if (!live.has(key)) {
        delete map[key]
        changed = true
      }
    }
    return changed
  })
}

/** 启动失败也会把 workspaceSessionReady 设上，但文件列表是空的。只有会话真的恢复过才清标记。 */
export function terminalFileLinkSessionHydrated(
  sessionReady: boolean,
  hydrationSucceeded: boolean
): boolean {
  return sessionReady && hydrationSucceeded
}

/**
 * 配对网页客户端的主机快照可能先漏掉标签、下一次再带回来。
 * 刚消失的路径先记下，下一次打开列表里还没有才删。
 */
export function nextTerminalFileLinkStayClosures(
  pending: readonly OpenPath[],
  previouslyOpen: readonly OpenPath[],
  currentlyOpen: readonly OpenPath[]
): { confirmed: OpenPath[]; pending: OpenPath[] } {
  const live = new Set(
    currentlyOpen.map((file) => terminalFileLinkStayKey(file.worktreeId, file.filePath))
  )
  const absent = (file: OpenPath): boolean =>
    !live.has(terminalFileLinkStayKey(file.worktreeId, file.filePath))
  return { confirmed: pending.filter(absent), pending: previouslyOpen.filter(absent) }
}

/** openFiles 还是同一个数组，并且要么还没恢复、要么已经清过，就不要再分配。 */
export function shouldSkipTerminalFileLinkStaySync(
  openFilesUnchanged: boolean,
  sessionReady: boolean,
  prunedAfterHydration: boolean
): boolean {
  return openFilesUnchanged && (prunedAfterHydration || !sessionReady)
}

export function resetTerminalFileLinkStayCacheForTests(): void {
  cache = null
}
