import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { REPOSITORY_PATH_REJECTED } from '../../git-workspace/constants'
import type { WorkspaceRepositoryRecord } from '../../git-workspace/types'

function escapes(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

function lexicalRepositoryPath(repositoryPath: string): string {
  if (repositoryPath.includes('\0') || isAbsolute(repositoryPath)) {
    throw new Error(REPOSITORY_PATH_REJECTED)
  }
  const parts = repositoryPath.split(/[\\/]/).filter((part) => part.length > 0)
  if (parts.includes('..')) {
    throw new Error(REPOSITORY_PATH_REJECTED)
  }
  return parts.join('/')
}

// 路径必须落在这次发现结果里，并且 realpath 不能顺着软链跑出工作区。
export async function locateWorkspaceRepository(
  worktreePath: string,
  repositoryPath: string,
  repositories: readonly WorkspaceRepositoryRecord[]
): Promise<WorkspaceRepositoryRecord> {
  const normalized = lexicalRepositoryPath(repositoryPath)
  const entry = repositories.find((repository) => repository.repositoryPath === normalized)
  if (!entry) {
    throw new Error(REPOSITORY_PATH_REJECTED)
  }
  const absolutePath = normalized
    ? resolve(worktreePath, ...normalized.split('/'))
    : resolve(worktreePath)
  if (escapes(resolve(worktreePath), absolutePath)) {
    throw new Error(REPOSITORY_PATH_REJECTED)
  }
  const rootReal = await realpath(worktreePath)
  let realPath: string
  try {
    realPath = await realpath(absolutePath)
  } catch {
    if (!entry.uninitialized) {
      throw new Error(REPOSITORY_PATH_REJECTED)
    }
    return entry
  }
  if (escapes(rootReal, realPath) || resolve(realPath) !== resolve(entry.realPath)) {
    throw new Error(REPOSITORY_PATH_REJECTED)
  }
  return entry
}
