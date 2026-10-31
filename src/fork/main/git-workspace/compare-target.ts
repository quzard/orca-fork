import type { GitRuntimeOptions } from '../../../main/git/git-runtime-options'
import { getBaseRefDefault } from '../../../main/git/repo-default-base-ref'
import type { CompareTargetResolution } from '../../git-workspace/types'
import type { CompareTargetKey, CompareTargetStore } from './compare-target-store'

// 用户保存的覆盖 > 上游 getBaseRefDefault（origin/HEAD，然后 origin/main、origin/master）> 未设置。
// 不读、不写工作区自己的 baseRef。
export const DEFAULT_BASE_CACHE_LIMIT = 64
export const DEFAULT_BASE_CACHE_TTL_MS = 5 * 60 * 1000

type CachedDefaultBase = {
  head: string | null
  resolution: CompareTargetResolution
  at: number
}

const defaultBaseCache = new Map<string, CachedDefaultBase>()

function defaultBaseCacheKey(key: CompareTargetKey): string {
  return [key.hostId, key.worktreePath, key.repositoryPath, key.branch].join('\0')
}

export function clearWorkspaceCompareTargetCache(): void {
  defaultBaseCache.clear()
}

function rememberDefaultBase(cacheKey: string, entry: CachedDefaultBase): void {
  defaultBaseCache.delete(cacheKey)
  defaultBaseCache.set(cacheKey, entry)
  while (defaultBaseCache.size > DEFAULT_BASE_CACHE_LIMIT) {
    const oldest = defaultBaseCache.keys().next().value
    if (oldest === undefined) {
      return
    }
    defaultBaseCache.delete(oldest)
  }
}

function cachedDefaultBase(
  cacheKey: string,
  head: string | null,
  now: number
): CompareTargetResolution | undefined {
  const cached = defaultBaseCache.get(cacheKey)
  if (!cached) {
    return undefined
  }
  // 命中后挪到队尾。过期或 HEAD 变了就丢掉，origin/HEAD 不会永远留着。
  defaultBaseCache.delete(cacheKey)
  if (cached.head !== head || now - cached.at >= DEFAULT_BASE_CACHE_TTL_MS) {
    return undefined
  }
  defaultBaseCache.set(cacheKey, cached)
  return cached.resolution
}

export async function resolveWorkspaceCompareTarget(args: {
  store: CompareTargetStore
  key: CompareTargetKey
  repoAbsolutePath: string
  gitOptions: GitRuntimeOptions
  head?: string | null
  refresh?: boolean
  now?: number
}): Promise<CompareTargetResolution> {
  // 覆盖按分支记。分离 HEAD 没有分支，只能用默认基线。
  const saved = args.key.branch ? await args.store.get(args.key) : null
  if (saved) {
    return { ref: saved, source: 'override' }
  }
  const head = args.head ?? null
  const now = args.now ?? Date.now()
  const cacheKey = defaultBaseCacheKey(args.key)
  if (!args.refresh) {
    const cached = cachedDefaultBase(cacheKey, head, now)
    if (cached) {
      return cached
    }
  }
  const detected = await getBaseRefDefault(args.repoAbsolutePath, {
    ...(args.gitOptions.wslDistro ? { wslDistro: args.gitOptions.wslDistro } : {}),
    admissionTier: 'background'
  })
  const resolution: CompareTargetResolution = detected
    ? { ref: detected, source: 'default' }
    : { ref: null, source: 'unset' }
  // 分离 HEAD（常见于子模块）也要记住，不然每次状态轮询都重跑一遍默认基线探测。
  rememberDefaultBase(cacheKey, { head, resolution, at: now })
  return resolution
}
