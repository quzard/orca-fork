import type { GitRuntimeOptions } from '../../../main/git/git-runtime-options'
import { getBaseRefDefault } from '../../../main/git/repo-default-base-ref'
import type { CompareTargetResolution } from '../../git-workspace/types'
import type { CompareTargetKey, CompareTargetStore } from './compare-target-store'

// 用户保存的覆盖 > 上游 getBaseRefDefault（origin/HEAD，然后 origin/main、origin/master）> 未设置。
// 不读、不写工作区自己的 baseRef。
const defaultBaseCache = new Map<
  string,
  { head: string | null; resolution: CompareTargetResolution }
>()

function defaultBaseCacheKey(key: CompareTargetKey): string {
  return [key.hostId, key.worktreePath, key.repositoryPath, key.branch].join('\0')
}

export function clearWorkspaceCompareTargetCache(): void {
  defaultBaseCache.clear()
}

export async function resolveWorkspaceCompareTarget(args: {
  store: CompareTargetStore
  key: CompareTargetKey
  repoAbsolutePath: string
  gitOptions: GitRuntimeOptions
  head?: string | null
  refresh?: boolean
}): Promise<CompareTargetResolution> {
  const saved = args.key.branch ? args.store.get(args.key) : null
  if (saved) {
    return { ref: saved, source: 'override' }
  }
  const head = args.head ?? null
  const cacheKey = defaultBaseCacheKey(args.key)
  const cached = defaultBaseCache.get(cacheKey)
  // 默认基线是 ref 名，分支和 HEAD 没变时不必再问 origin/HEAD。
  if (!args.refresh && cached && cached.head === head) {
    return cached.resolution
  }
  const detected = await getBaseRefDefault(args.repoAbsolutePath, {
    ...(args.gitOptions.wslDistro ? { wslDistro: args.gitOptions.wslDistro } : {}),
    admissionTier: 'background'
  })
  const resolution: CompareTargetResolution = detected
    ? { ref: detected, source: 'default' }
    : { ref: null, source: 'unset' }
  if (args.key.branch) {
    defaultBaseCache.set(cacheKey, { head, resolution })
  }
  return resolution
}
