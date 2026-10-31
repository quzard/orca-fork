import { WORKSPACE_REPOSITORY_DISCOVERY_STALE_MS } from '../git-workspace/constants'
import type { WorkspaceRepositoryRecord } from '../git-workspace/types'

const byWorktree = new Map<
  string,
  { at: number; repositories: readonly WorkspaceRepositoryRecord[] }
>()

export function rememberDiscoveredRepositories(
  worktreeId: string,
  repositories: readonly WorkspaceRepositoryRecord[],
  now = Date.now()
): void {
  byWorktree.set(worktreeId, { at: now, repositories })
}

export function clearDiscoveredRepositoriesForTests(): void {
  byWorktree.clear()
}

export function hasDiscoveredRepositories(worktreeId: string): boolean {
  return byWorktree.has(worktreeId)
}

// 面板开着时每轮轮询都会刷新这份记录。面板没开、记录变旧时，diff 先重新发现再分流。
export function discoveredRepositoriesAreFresh(worktreeId: string, now = Date.now()): boolean {
  const record = byWorktree.get(worktreeId)
  return record !== undefined && now - record.at < WORKSPACE_REPOSITORY_DISCOVERY_STALE_MS
}

// 还没扫过这个工作区时返回 null 的是「没有记录」，不是「路径不在嵌套仓库里」。
export function repositoryForRootRelativePath(
  worktreeId: string,
  relativePath: string
): { repositoryPath: string; filePath: string } | null {
  const repositories = byWorktree.get(worktreeId)?.repositories
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
