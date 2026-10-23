import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-environment'
import { COMPARE_TARGET_DIRECTORY, COMPARE_TARGET_FILE_NAME } from '../../git-workspace/constants'

export type CompareTargetKey = {
  hostId: string
  worktreePath: string
  repositoryPath: string
  branch: string
}

export type CompareTargetEntry = CompareTargetKey & { ref: string }

type CompareTargetFile = { version: 1; entries: CompareTargetEntry[] }

export function compareTargetFilePath(userDataPath: string): string {
  return join(userDataPath, COMPARE_TARGET_DIRECTORY, COMPARE_TARGET_FILE_NAME)
}

function isCompareTargetEntry(value: unknown): value is CompareTargetEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  // SAFETY: 磁盘上的 JSON 没有类型。只把五个字段都是字符串的对象当成一条覆盖。
  const entry = value as Record<string, unknown>
  return (
    typeof entry.hostId === 'string' &&
    typeof entry.worktreePath === 'string' &&
    typeof entry.repositoryPath === 'string' &&
    typeof entry.branch === 'string' &&
    typeof entry.ref === 'string'
  )
}

function sameKey(entry: CompareTargetEntry, key: CompareTargetKey): boolean {
  return (
    entry.hostId === key.hostId &&
    entry.worktreePath === key.worktreePath &&
    entry.repositoryPath === key.repositoryPath &&
    entry.branch === key.branch
  )
}

// 桌面和 `orca serve` 的 orcad 可以共用一份 userData（ORCA_USER_DATA 指向桌面 profile）。
// 互斥靠共享实例锁，桌面以 role 'desktop' 领取。锁被占用时另一边起不来。
// state 为 'unavailable' 时桌面拿不到锁仍会启动，两边可能同时写这个文件。
// 下面的队列只串起本进程。发布前再读一次合并，缩小丢掉对方写入的窗口。
const writeQueues = new Map<string, Promise<void>>()
let temporarySerial = 0

function enqueueWrite(filePath: string, write: () => void): Promise<void> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve()
  const task = previous.then(write, write)
  const settled = task.then(
    () => undefined,
    () => undefined
  )
  writeQueues.set(filePath, settled)
  return task
}

export class CompareTargetStore {
  constructor(private readonly filePath: string) {}

  static fromUserData(): CompareTargetStore {
    return new CompareTargetStore(compareTargetFilePath(getAppEnvironment().getPath('userData')))
  }

  read(): CompareTargetEntry[] {
    return this.readFile() ?? []
  }

  // null：文件在，但读不了或不是 JSON。缺文件是空表，调用方可以新建。
  private readFile(): CompareTargetEntry[] | null {
    let raw: string
    try {
      raw = readFileSync(this.filePath, 'utf8')
    } catch (error) {
      return isEnoent(error) ? [] : null
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !('entries' in parsed)) {
        return []
      }
      const entries = (parsed as { entries?: unknown }).entries
      if (!Array.isArray(entries)) {
        return []
      }
      return entries.filter((entry): entry is CompareTargetEntry => isCompareTargetEntry(entry))
    } catch {
      return null
    }
  }

  get(key: CompareTargetKey): string | null {
    return this.read().find((entry) => sameKey(entry, key))?.ref ?? null
  }

  private refuseUnreadable(): never {
    console.warn('[fork] compare-target file is unreadable; leaving it unchanged')
    throw new Error('compare target file is unreadable')
  }

  private writeBody(temporary: string, entries: CompareTargetEntry[]): void {
    const body: CompareTargetFile = { version: 1, entries }
    writeFileSync(temporary, `${JSON.stringify(body)}\n`, { encoding: 'utf8', mode: 0o600 })
  }

  // ref 为 null 时删掉这一档。先写临时文件，rename 前再读一次合并，读到的永远是完整 JSON。
  set(key: CompareTargetKey, ref: string | null): Promise<void> {
    return enqueueWrite(this.filePath, () => {
      const loaded = this.readFile()
      if (loaded === null) {
        this.refuseUnreadable()
      }
      const merged = withRef(loaded, key, ref)
      const temporary = `${this.filePath}.${process.pid}.${Date.now()}.${temporarySerial}.tmp`
      temporarySerial += 1
      mkdirSync(dirname(this.filePath), { recursive: true })
      try {
        this.writeBody(temporary, merged)
        // 对方可能在第一次读之后、这次 rename 之前写过。读不了就不改名，避免盖掉原文件。
        const latest = this.readFile()
        if (latest === null) {
          this.refuseUnreadable()
        }
        const again = withRef(latest, key, ref)
        if (JSON.stringify(again) !== JSON.stringify(merged)) {
          this.writeBody(temporary, again)
        }
        renameSync(temporary, this.filePath)
      } catch (error) {
        rmSync(temporary, { force: true })
        throw error
      }
    })
  }
}

function isEnoent(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

function withRef(
  entries: CompareTargetEntry[],
  key: CompareTargetKey,
  ref: string | null
): CompareTargetEntry[] {
  const next = entries.filter((entry) => !sameKey(entry, key))
  if (ref !== null) {
    next.push({ ...key, ref })
  }
  return next
}
