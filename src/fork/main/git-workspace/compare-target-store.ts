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

export class CompareTargetStore {
  constructor(private readonly filePath: string) {}

  static fromUserData(): CompareTargetStore {
    return new CompareTargetStore(compareTargetFilePath(getAppEnvironment().getPath('userData')))
  }

  read(): CompareTargetEntry[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || !('entries' in parsed)) {
        return []
      }
      const entries = (parsed as { entries?: unknown }).entries
      if (!Array.isArray(entries)) {
        return []
      }
      return entries.filter((entry): entry is CompareTargetEntry => isCompareTargetEntry(entry))
    } catch {
      return []
    }
  }

  get(key: CompareTargetKey): string | null {
    return this.read().find((entry) => sameKey(entry, key))?.ref ?? null
  }

  // ref 为 null 时删掉这一档。先写临时文件再 rename，读到的永远是完整 JSON。
  set(key: CompareTargetKey, ref: string | null): void {
    const entries = this.read().filter((entry) => !sameKey(entry, key))
    if (ref !== null) {
      entries.push({ ...key, ref })
    }
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    const body: CompareTargetFile = { version: 1, entries }
    mkdirSync(dirname(this.filePath), { recursive: true })
    try {
      writeFileSync(temporary, `${JSON.stringify(body)}\n`, { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, this.filePath)
    } catch (error) {
      rmSync(temporary, { force: true })
      throw error
    }
  }
}
