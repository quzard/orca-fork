import { z } from 'zod'
import { OptionalGitAdmissionTier } from '../../shared/rpc-contract/git-admission-tier-params'
import {
  GitBranchCompare,
  GitBranchDiff,
  GitDiff,
  WorktreeSelector
} from '../../shared/rpc-contract/git-params'
import { COMPARE_TARGET_MAX_REF_LENGTH } from './constants'

// 这些 schema 只挂在 fork 方法上。上游 git.status 等不能加 repositoryPath：旧宿主会丢掉不认识的字段，静默返回根仓库。
const repositoryPath = z
  .string()
  .refine((value) => !value.includes('\0'), 'repository path contains NUL')
  .refine((value) => !value.split(/[\\/]/).includes('..'), 'repository path escapes')

// 存进比较目标文件的 ref：不能被当成参数，也不能拆成多行。
const gitRef = z
  .string()
  .min(1, 'Missing ref')
  .max(COMPARE_TARGET_MAX_REF_LENGTH)
  .refine(
    (value) => !value.startsWith('-') && !value.includes('\0') && !/[\r\n]/.test(value),
    'invalid ref'
  )

export const GitWorkspaceRepositoriesParams = WorktreeSelector.extend({
  refresh: z.boolean().optional()
})

export const GitWorkspaceRepositoryStatusParams = WorktreeSelector.extend({
  repositoryPath,
  admissionTier: OptionalGitAdmissionTier,
  refresh: z.boolean().optional()
})

// 文件路径、ref 和 OID 的校验跟上游同名方法一致。
export const GitWorkspaceRepositoryBranchCompareParams = GitBranchCompare.extend({ repositoryPath })

export const GitWorkspaceRepositoryDiffParams = GitDiff.extend({ repositoryPath })

export const GitWorkspaceRepositoryBranchDiffParams = GitBranchDiff.extend({ repositoryPath })

export const GitWorkspaceSetCompareTargetParams = WorktreeSelector.extend({
  repositoryPath,
  branch: gitRef,
  ref: gitRef.nullable()
})
