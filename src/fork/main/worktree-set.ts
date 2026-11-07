// worktree set 的父级解析。文件夹父级只在预览构建登记后放行，避免上游文件越过行数上限。
import type { HandlerContext } from '../../cli/dispatch'
import { formatWorktreeShow, printResult } from '../../cli/format'
import { getOptionalStringFlag, getOptionalStringFlagAllowingEmpty } from '../../cli/flags'
import { RuntimeClientError } from '../../cli/runtime-client'
import { getRequiredWorktreeSelector } from '../../cli/selectors'
import { withWorktreeSelectorRecovery } from '../../cli/worktree-selector-recovery'
import { allowFolderParentSet } from '../../shared/fork-hooks/requirement-preview'
import type { RuntimeWorktreeSetResult } from '../../shared/runtime-types'
import {
  assertWorktreeParentFlagsCompatible,
  getWorkspaceKeyParentSelector
} from '../../cli/handlers/worktree-create-parent-selector'
import { formatCrossStoreParentLine } from '../../cli/handlers/worktree-lineage-summary'
import { resolveSetParentFields } from '../../cli/handlers/worktree-parent-fields'
import { getOptionalLinearIssueLinkFlag } from '../../cli/handlers/worktree-linear-issue-link'
import { getReviewTargetLinkFlags } from '../../cli/handlers/worktree-review-link-flags'
import { getWorktreeReadFlags } from '../../cli/handlers/worktree-unread-flag'
import { assertGitLabLinkFlagProjectsMatch } from '../../cli/handlers/worktree-gitlab-link-context'

export async function runWorktreeSet({ flags, client, cwd, json }: HandlerContext): Promise<void> {
  assertWorktreeParentFlagsCompatible(
    flags,
    'Choose either --parent-worktree or --no-parent, not both.'
  )
  const parentSelector = getOptionalStringFlag(flags, 'parent-worktree')
  const folderParentSelector = parentSelector
    ? getWorkspaceKeyParentSelector(parentSelector)
    : undefined
  if (folderParentSelector?.startsWith('folder:') && !allowFolderParentSet(folderParentSelector)) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Parent selector "${parentSelector}" is a folder. Folder parents are accepted only by orca worktree create.`
    )
  }
  const readFlags = getWorktreeReadFlags(flags)
  const reviewLinks = getReviewTargetLinkFlags(flags, { nullable: true })
  const linearIssueLink = getOptionalLinearIssueLinkFlag(flags, 'linear-issue', {
    allowNull: true
  })
  const worktree = await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
  await assertGitLabLinkFlagProjectsMatch(flags, client, { worktree })
  const parentFields =
    folderParentSelector && allowFolderParentSet(folderParentSelector)
      ? { parentWorktree: folderParentSelector }
      : await resolveSetParentFields(flags, cwd, client)
  const pending = client.call<RuntimeWorktreeSetResult>('worktree.set', {
    worktree,
    displayName: getOptionalStringFlag(flags, 'display-name'),
    ...reviewLinks,
    ...linearIssueLink,
    // An explicit empty value clears the stored comment.
    comment: getOptionalStringFlagAllowingEmpty(flags, 'comment'),
    workspaceStatus: getOptionalStringFlag(flags, 'workspace-status'),
    ...readFlags,
    ...parentFields,
    noParent: flags.get('no-parent') === true
  })
  const result = await withWorktreeSelectorRecovery(
    pending,
    parentSelector
      ? [
          `Orca could not find the worktree selector "${worktree}" or the parent selector "${parentSelector}". The server did not identify which selector failed.`,
          'Check both selectors with orca worktree show --worktree <selector> --json.'
        ]
      : []
  )
  if (!json) {
    for (const warning of result.result.warnings ?? []) {
      console.error(`warning: ${warning.message}`)
    }
    // The same-store lineage fields stay null for a parent on another machine.
    const crossStoreLineage = result.result.worktree.crossStoreLineage
    if (parentFields.crossStoreParent && crossStoreLineage) {
      console.error(formatCrossStoreParentLine(crossStoreLineage))
    }
  }
  printResult(result, json, formatWorktreeShow)
}
