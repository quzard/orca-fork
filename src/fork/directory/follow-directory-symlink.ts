import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RemoteDirectoryEntry } from '../../shared/fork-hooks/remote-directory'

/**
 * Mark a symlink as a directory when its target is a directory.
 * A dangling link stays a file. Non-symlinks are unchanged.
 */
export async function followDirectorySymlinks(
  entries: readonly RemoteDirectoryEntry[],
  directoryPath: string
): Promise<RemoteDirectoryEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory || entry.isSymlink !== true) {
        return entry
      }
      try {
        const targetIsDirectory = (await stat(resolve(directoryPath, entry.name))).isDirectory()
        return targetIsDirectory ? { ...entry, isDirectory: true } : entry
      } catch {
        return entry
      }
    })
  )
}
