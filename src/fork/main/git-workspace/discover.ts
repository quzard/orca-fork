import { readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { GitRuntimeOptions } from '../../../main/git/git-runtime-options'
import { listSubmodulePaths } from '../../../main/git/source-control/submodule-paths'
import {
  WORKSPACE_REPOSITORY_DISCOVERY_CACHE_MS,
  WORKSPACE_REPOSITORY_MAX_REPOS,
  WORKSPACE_REPOSITORY_TIMEOUT_MS
} from '../../git-workspace/constants'
import type {
  WorkspaceRepositoryKind,
  WorkspaceRepositoryList,
  WorkspaceRepositoryRecord
} from '../../git-workspace/types'

type DiscoveryOptions = {
  maxRepos: number
  timeoutMs: number
  refresh: boolean
  gitOptions: GitRuntimeOptions
  signal?: AbortSignal
}

type AddRepository = (
  repositoryPath: string,
  realPath: string,
  kind: WorkspaceRepositoryKind,
  uninitialized: boolean,
  depth: number
) => boolean

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

// 软链的 realpath 跑出工作区就丢掉。目录还不存在和逃出去要分开，前者才可能是未初始化子模块。
async function resolveInside(
  rootReal: string,
  absPath: string
): Promise<{ kind: 'inside'; realPath: string } | { kind: 'missing' } | { kind: 'escape' }> {
  try {
    const realPath = await realpath(absPath)
    return escapes(rootReal, realPath) ? { kind: 'escape' } : { kind: 'inside', realPath }
  } catch {
    return { kind: 'missing' }
  }
}

export async function discoverWorkspaceRepositories(
  worktreePath: string,
  options: Partial<DiscoveryOptions> = {}
): Promise<WorkspaceRepositoryList> {
  const maxRepos = options.maxRepos ?? WORKSPACE_REPOSITORY_MAX_REPOS
  const timeoutMs = options.timeoutMs ?? WORKSPACE_REPOSITORY_TIMEOUT_MS
  const gitOptions = options.gitOptions ?? {}
  const rootReal = await realpath(worktreePath)
  const cacheKey = [rootReal, maxRepos, timeoutMs].join('\0')
  const cached = cache.get(cacheKey)
  if (!options.refresh && cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const records: WorkspaceRepositoryRecord[] = []
  const seen = new Set<string>()
  let truncated = false
  let timedOut = false
  const deadline = Date.now() + timeoutMs
  // 到点或调用方取消就停。超时要记下来，取消不记成超时，两种都不进缓存。
  const stop = (): boolean => {
    if (options.signal?.aborted) {
      return true
    }
    if (Date.now() < deadline) {
      return false
    }
    timedOut = true
    return true
  }
  const add: AddRepository = (repositoryPath, realPath, kind, uninitialized, depth) => {
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
  const atCap = (): boolean => {
    if (records.length < maxRepos) {
      return false
    }
    truncated = true
    return true
  }

  // 根仓库占一个名额。只再看直接子目录，发现到的仓库不再往下走。
  if (await hasGitMarker(worktreePath)) {
    add('', rootReal, 'root', false, 0)
  }
  if (!stop()) {
    await addFirstLevelChildren(worktreePath, rootReal, stop, atCap, add)
  }
  if (!timedOut && !options.signal?.aborted && records.some((record) => record.kind === 'root')) {
    await addUninitializedSubmodules(worktreePath, rootReal, gitOptions, stop, atCap, add)
  }
  records.sort((left, right) => left.repositoryPath.localeCompare(right.repositoryPath))
  const value = { repositories: records, truncated, timedOut }
  if (!timedOut && !options.signal?.aborted) {
    cache.set(cacheKey, { expiresAt: Date.now() + WORKSPACE_REPOSITORY_DISCOVERY_CACHE_MS, value })
  }
  return value
}

async function addFirstLevelChildren(
  worktreePath: string,
  rootReal: string,
  stop: () => boolean,
  atCap: () => boolean,
  add: AddRepository
): Promise<void> {
  let entries: { name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean }[]
  try {
    entries = await readdir(worktreePath, { withFileTypes: true })
  } catch {
    return
  }
  const names = entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
  for (const name of names) {
    if (stop()) {
      return
    }
    const absolute = join(worktreePath, name)
    if (!(await hasGitMarker(absolute))) {
      continue
    }
    // 名额用在已经找到的仓库上。空目录不占名额，也不当成「还有仓库没列出来」。
    if (atCap()) {
      return
    }
    const resolved = await resolveInside(rootReal, absolute)
    if (resolved.kind !== 'inside') {
      continue
    }
    const repositoryPath = posixRelative(rootReal, resolved.realPath)
    if (!repositoryPath) {
      continue
    }
    add(repositoryPath, resolved.realPath, 'nested', false, 1)
  }
}

// 只读根仓库的 .gitmodules。子仓库里的子模块不单列。没检出的收进界面的「其他」，不占自己的一栏。
async function addUninitializedSubmodules(
  worktreePath: string,
  rootReal: string,
  gitOptions: GitRuntimeOptions,
  stop: () => boolean,
  atCap: () => boolean,
  add: AddRepository
): Promise<void> {
  if (stop()) {
    return
  }
  const paths = await listSubmodulePaths(worktreePath, gitOptions).catch(() => [])
  for (const submodulePath of paths) {
    if (stop()) {
      return
    }
    const repositoryPath = submodulePath.replace(/\\/g, '/').replace(/\/+$/, '')
    if (!repositoryPath || repositoryPath.split('/').includes('..')) {
      continue
    }
    const absolute = resolve(rootReal, ...repositoryPath.split('/'))
    if (escapes(rootReal, absolute)) {
      continue
    }
    const resolved = await resolveInside(rootReal, absolute)
    if (resolved.kind === 'escape') {
      continue
    }
    if (resolved.kind === 'inside' && (await hasGitMarker(resolved.realPath))) {
      // 已经是检出就由直接子目录那一轮负责。深层的检出不补进来。
      continue
    }
    if (atCap()) {
      return
    }
    const realPath = resolved.kind === 'inside' ? resolved.realPath : absolute
    add(repositoryPath, realPath, 'submodule', true, repositoryPath.split('/').length)
  }
}
