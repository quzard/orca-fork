import { z } from 'zod'
import { OptionalGitAdmissionTier } from '../../shared/rpc-contract/git-admission-tier-params'
import { FullGitObjectId, WorktreeSelector } from '../../shared/rpc-contract/git-params'
import { COMPARE_TARGET_MAX_REF_LENGTH } from './constants'

// 这些 schema 只挂在 fork 方法上。上游 git.status 等不能加 repositoryPath：旧宿主会丢掉不认识的字段，静默返回根仓库。
const repositoryPath = z
  .string()
  .refine((value) => !value.includes('\0'), 'repository path contains NUL')
  .refine((value) => !value.split(/[\\/]/).includes('..'), 'repository path escapes')

const insideFilePath = z
  .string()
  .min(1, 'Missing file path')
  .refine((value) => !value.includes('\0') && !value.startsWith('-'), 'invalid file path')

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

export const GitWorkspaceRepositoryParams = WorktreeSelector.extend({
  repositoryPath,
  admissionTier: OptionalGitAdmissionTier
})

export const GitWorkspaceRepositoryStatusParams = GitWorkspaceRepositoryParams

export const GitWorkspaceRepositoryBranchCompareParams = GitWorkspaceRepositoryParams.extend({
  baseRef: gitRef
})

export const GitWorkspaceRepositoryDiffParams = GitWorkspaceRepositoryParams.extend({
  filePath: insideFilePath,
  staged: z.boolean(),
  compareAgainstHead: z.boolean().optional()
})

export const GitWorkspaceRepositoryBranchDiffParams = GitWorkspaceRepositoryParams.extend({
  filePath: insideFilePath,
  oldPath: insideFilePath.optional(),
  compare: z.object({
    baseRef: z.string().optional(),
    baseOid: FullGitObjectId.optional(),
    headOid: FullGitObjectId,
    mergeBase: FullGitObjectId
  })
})

export const GitWorkspaceSetCompareTargetParams = GitWorkspaceRepositoryParams.extend({
  branch: gitRef,
  ref: gitRef.nullable()
})
