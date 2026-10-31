import { rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-environment'
import { renameFileWithWindowsRetry } from '../../../shared/windows-retry-file-operations'
import { withFileTransactionLock } from '../../../main/file-transaction-lock'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCompareTargetEntry(value: unknown): value is CompareTargetEntry {
  return (
    isRecord(value) &&
    typeof value.hostId === 'string' &&
    typeof value.worktreePath === 'string' &&
    typeof value.repositoryPath === 'string' &&
    typeof value.branch === 'string' &&
    typeof value.ref === 'string'
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

function isEnoent(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

// null：文件在，但读不了、不是 JSON，或者不是这一版的格式。缺文件是空表，调用方可以新建。
async function readEntries(filePath: string): Promise<CompareTargetEntry[] | null> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    return isEnoent(error) ? [] : null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return null
    }
    return parsed.entries.filter(isCompareTargetEntry)
  } catch {
    return null
  }
}

// 桌面和 `orca serve` 的 orcad 可以共用一份 userData（实例锁 unavailable 时两边都会起来）。
// 写入用上游的跨进程文件事务锁串起来；读不加锁，靠临时文件加 rename 永远读到完整 JSON。
export class CompareTargetStore {
  constructor(private readonly filePath: string) {}

  static fromUserData(): CompareTargetStore {
    return new CompareTargetStore(compareTargetFilePath(getAppEnvironment().getPath('userData')))
  }

  async read(): Promise<CompareTargetEntry[]> {
    return (await readEntries(this.filePath)) ?? []
  }

  async get(key: CompareTargetKey): Promise<string | null> {
    return (await this.read()).find((entry) => sameKey(entry, key))?.ref ?? null
  }

  // ref 为 null 时删掉这一档。读不了的文件原样留着，不拿空表覆盖。
  set(key: CompareTargetKey, ref: string | null): Promise<void> {
    return withFileTransactionLock(this.filePath, async () => {
      const loaded = await readEntries(this.filePath)
      if (loaded === null) {
        console.warn('[fork] compare-target file is unreadable; leaving it unchanged')
        throw new Error('compare target file is unreadable')
      }
      const entries = loaded.filter((entry) => !sameKey(entry, key))
      if (ref !== null) {
        entries.push({ ...key, ref })
      }
      const body: CompareTargetFile = { version: 1, entries }
      const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
      try {
        writeFileSync(temporary, `${JSON.stringify(body)}\n`, { encoding: 'utf8', mode: 0o600 })
        renameFileWithWindowsRetry(temporary, this.filePath)
      } finally {
        rmSync(temporary, { force: true })
      }
    })
  }
}
