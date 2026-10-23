import type { GitRuntimeOptions } from '../../../main/git/git-runtime-options'
import { getBaseRefDefault } from '../../../main/git/repo-default-base-ref'
import type { CompareTargetResolution } from '../../git-workspace/types'
import type { CompareTargetKey, CompareTargetStore } from './compare-target-store'

// 用户保存的覆盖 > 上游 getBaseRefDefault（origin/HEAD，然后 origin/main、origin/master）> 未设置。
// 不读、不写工作区自己的 baseRef。
export async function resolveWorkspaceCompareTarget(args: {
  store: CompareTargetStore
  key: CompareTargetKey
  repoAbsolutePath: string
  gitOptions: GitRuntimeOptions
}): Promise<CompareTargetResolution> {
  const saved = args.key.branch ? args.store.get(args.key) : null
  if (saved) {
    return { ref: saved, source: 'override' }
  }
  const detected = await getBaseRefDefault(args.repoAbsolutePath, {
    ...(args.gitOptions.wslDistro ? { wslDistro: args.gitOptions.wslDistro } : {}),
    admissionTier: 'background'
  })
  return detected ? { ref: detected, source: 'default' } : { ref: null, source: 'unset' }
}
