import { realpath, readFile, readdir, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { GitRuntimeOptions } from '../../../main/git/git-runtime-options'
import { listSubmodulePaths } from '../../../main/git/source-control/submodule-paths'
import { scanNestedRepos } from '../../../main/project-groups/nested-repo-discovery'
import type { NestedRepoScanFilesystem } from '../../../main/project-groups/nested-repo-scan-rules'
import {
  WORKSPACE_REPOSITORY_DISCOVERY_CACHE_MS,
  WORKSPACE_REPOSITORY_MAX_DEPTH,
  WORKSPACE_REPOSITORY_MAX_REPOS,
  WORKSPACE_REPOSITORY_TIMEOUT_MS
} from '../../git-workspace/constants'
import type {
  WorkspaceRepositoryKind,
  WorkspaceRepositoryList,
  WorkspaceRepositoryRecord
} from '../../git-workspace/types'

type DiscoveryOptions = {
  maxDepth: number
  maxRepos: number
  timeoutMs: number
  refresh: boolean
  gitOptions: GitRuntimeOptions
  signal?: AbortSignal
}

const cache = new Map<string, { expiresAt: number; value: WorkspaceRepositoryList }>()

export function clearWorkspaceRepositoryDiscoveryCache(): void {
  cache.clear()
}

// .git 目录或文件都算检出。worktree add 写的是文件，不能只认目录。
async function hasGitMarker(dirPath: string): Promise<boolean> {
  try {
    const marker = await stat(join(dirPath, '.git'))
    return marker.isDirectory() || marker.isFile()
  } catch {
    return false
  }
}

function filesystem(worktreeRoot: string): NestedRepoScanFilesystem {
  return {
    readDirectory: async (dirPath) => {
      const entries = await readdir(dirPath, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink()
      }))
    },
    // 根仓库经常用 .gitignore 挡住嵌套检出。根上的规则丢掉，更深层的仍交给上游。
    readTextFile: (filePath) =>
      resolve(filePath) === resolve(worktreeRoot, '.gitignore')
        ? Promise.resolve('')
        : readFile(filePath, 'utf8'),
    joinPath: join,
    basename,
    hasGitMarker,
    isSelectedPathGitRepo: () => false
  }
}

function escapes(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

function posixRelative(rootReal: string, realPath: string): string | null {
  const rel = relative(rootReal, realPath)
  if (rel === '') {
    return ''
  }
  if (!rel || escapes(rootReal, realPath)) {
    return null
  }
  return rel.split(sep).join('/')
}

async function realInside(rootReal: string, absPath: string): Promise<string | null> {
  try {
    const realPath = await realpath(absPath)
    return escapes(rootReal, realPath) ? null : realPath
  } catch {
    return null
  }
}

export async function discoverWorkspaceRepositories(
  worktreePath: string,
  options: Partial<DiscoveryOptions> = {}
): Promise<WorkspaceRepositoryList> {
  const maxDepth = options.maxDepth ?? WORKSPACE_REPOSITORY_MAX_DEPTH
  const maxRepos = options.maxRepos ?? WORKSPACE_REPOSITORY_MAX_REPOS
  const timeoutMs = options.timeoutMs ?? WORKSPACE_REPOSITORY_TIMEOUT_MS
  const gitOptions = options.gitOptions ?? {}
  const rootReal = await realpath(worktreePath)
  const cacheKey = [rootReal, maxDepth, maxRepos, timeoutMs].join('\0')
  const cached = cache.get(cacheKey)
  if (!options.refresh && cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const records: WorkspaceRepositoryRecord[] = []
  const seen = new Set<string>()
  let truncated = false
  let timedOut = false
  const deadline = Date.now() + timeoutMs
  const fs = filesystem(worktreePath)

  const add = (
    repositoryPath: string,
    realPath: string,
    kind: WorkspaceRepositoryKind,
    uninitialized: boolean,
    depth: number
  ): boolean => {
    if (seen.has(realPath) || records.some((record) => record.repositoryPath === repositoryPath)) {
      return false
    }
    if (records.length >= maxRepos) {
      truncated = true
      return false
    }
    seen.add(realPath)
    records.push({ repositoryPath, kind, uninitialized, depth, realPath })
    return true
  }

  // 上游扫到 git 标记就不再往下走。这里按剩余深度再扫一层，才能看见仓库里的仓库。
  const walk = async (start: string, depthOffset: number): Promise<void> => {
    if (truncated || timedOut || options.signal?.aborted) {
      return
    }
    const budget = maxDepth - depthOffset
    const remainingMs = deadline - Date.now()
    if (budget < 1 || remainingMs <= 0 || records.length >= maxRepos) {
      if (remainingMs <= 0) {
        timedOut = true
      }
      if (records.length >= maxRepos) {
        truncated = true
      }
      return
    }
    const scan = await scanNestedRepos({
      path: start,
      options: { maxDepth: budget, maxRepos: maxRepos - records.length, timeoutMs: remainingMs },
      filesystem: fs,
      signal: options.signal
    })
    truncated ||= scan.truncated
    timedOut ||= scan.timedOut
    for (const repo of scan.repos) {
      const realPath = await realInside(rootReal, repo.path)
      const repositoryPath = realPath ? posixRelative(rootReal, realPath) : null
      if (!realPath || !repositoryPath) {
        continue
      }
      const depth = depthOffset + repo.depth
      if (!add(repositoryPath, realPath, 'nested', false, depth) || depth >= maxDepth) {
        continue
      }
      await walk(realPath, depth)
      if (truncated || timedOut) {
        return
      }
    }
  }

  // 根仓库占一个名额，避免数量上限把工作区自己裁掉。
  if (await hasGitMarker(worktreePath)) {
    add('', rootReal, 'root', false, 0)
  }
  await walk(worktreePath, 0)
  await mergeSubmodules(rootReal, records, gitOptions, add)
  records.sort((left, right) => left.repositoryPath.localeCompare(right.repositoryPath))
  const value = { repositories: records, truncated, timedOut }
  if (!timedOut && !options.signal?.aborted) {
    cache.set(cacheKey, { expiresAt: Date.now() + WORKSPACE_REPOSITORY_DISCOVERY_CACHE_MS, value })
  }
  return value
}

async function mergeSubmodules(
  rootReal: string,
  records: readonly WorkspaceRepositoryRecord[],
  gitOptions: GitRuntimeOptions,
  add: (
    repositoryPath: string,
    realPath: string,
    kind: WorkspaceRepositoryKind,
    uninitialized: boolean,
    depth: number
  ) => boolean
): Promise<void> {
  const parents = records.filter((record) => !record.uninitialized)
  for (const parent of parents) {
    const paths = await listSubmodulePaths(parent.realPath, gitOptions).catch(() => [])
    for (const submodulePath of paths) {
      const repositoryPath = parent.repositoryPath
        ? `${parent.repositoryPath}/${submodulePath}`
        : submodulePath
      if (repositoryPath.split('/').includes('..')) {
        continue
      }
      const absolute = resolve(parent.realPath, ...submodulePath.split('/'))
      const depth = parent.depth + submodulePath.split('/').length
      const realPath = await realInside(rootReal, absolute)
      if (!realPath) {
        // 目录还不存在。词法路径仍在父仓库里才记成未初始化子模块。
        if (!escapes(parent.realPath, absolute)) {
          add(repositoryPath, absolute, 'submodule', true, depth)
        }
        continue
      }
      add(repositoryPath, realPath, 'submodule', !(await hasGitMarker(realPath)), depth)
    }
  }
}
