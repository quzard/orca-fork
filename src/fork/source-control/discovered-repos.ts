import type { WorkspaceRepositoryRecord } from '../git-workspace/types'

const byWorktree = new Map<string, readonly WorkspaceRepositoryRecord[]>()

export function rememberDiscoveredRepositories(
  worktreeId: string,
  repositories: readonly WorkspaceRepositoryRecord[]
): void {
  byWorktree.set(worktreeId, repositories)
}

export function clearDiscoveredRepositoriesForTests(): void {
  byWorktree.clear()
}

export function hasDiscoveredRepositories(worktreeId: string): boolean {
  return byWorktree.has(worktreeId)
}

// 还没扫过这个工作区时返回 null 的是「没有记录」，不是「路径不在嵌套仓库里」。
export function repositoryForRootRelativePath(
  worktreeId: string,
  relativePath: string
): { repositoryPath: string; filePath: string } | null {
  const repositories = byWorktree.get(worktreeId)
  if (!repositories) {
    return null
  }
  const normalized = relativePath.split('\\').join('/')
  let best: WorkspaceRepositoryRecord | null = null
  for (const repository of repositories) {
    if (!repository.repositoryPath || repository.uninitialized) {
      continue
    }
    const prefix = repository.repositoryPath
    if (normalized !== prefix && !normalized.startsWith(`${prefix}/`)) {
      continue
    }
    if (!best || prefix.length > best.repositoryPath.length) {
      best = repository
    }
  }
  if (!best) {
    return null
  }
  const filePath = normalized.slice(best.repositoryPath.length + 1)
  // 仓库目录本身不是文件 diff。
  if (!filePath) {
    return null
  }
  return { repositoryPath: best.repositoryPath, filePath }
}
