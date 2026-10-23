import type { GitStatusEntry } from '../../../shared/git-status-types'
import type { WorkspaceRepositoryRecord } from '../../git-workspace/types'

function normalized(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

// 已经单独成栏的仓库。未初始化子模块在「其他」里，不从根仓库的变更里抠掉。
export function listedNestedRepositoryRoots(
  repositories: readonly WorkspaceRepositoryRecord[]
): string[] {
  return repositories
    .filter((repository) => repository.repositoryPath.length > 0 && !repository.uninitialized)
    .map((repository) => repository.repositoryPath)
}

export function entryBelongsToNestedRepository(path: string, roots: readonly string[]): boolean {
  const normalizedPath = normalized(path)
  return roots.some((root) => {
    const nested = normalized(root)
    return (
      nested.length > 0 && (normalizedPath === nested || normalizedPath.startsWith(`${nested}/`))
    )
  })
}

export function omitNestedRepositoryEntries(
  entries: readonly GitStatusEntry[],
  roots: readonly string[]
): GitStatusEntry[] {
  if (roots.length === 0) {
    return [...entries]
  }
  // 未跟踪的嵌套目录不是根仓库的改动。暂存或未暂存的 gitlink 是根上的子模块指针，要留着。
  return entries.filter(
    (entry) => entry.area !== 'untracked' || !entryBelongsToNestedRepository(entry.path, roots)
  )
}
