import type { MemberFacts, UnknownFact } from './badges'
import { unavailableMemberFacts } from './badges'

type PullRequestFact = {
  state: 'open' | 'closed' | 'merged' | 'draft'
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  checksStatus?: 'pending' | 'success' | 'failure' | 'neutral'
  observedAt: number | null
  error?: string
}

function known<T extends string>(value: T, observedAt: number | null) {
  return { known: true as const, value, observedAt }
}

function unknown(detail?: string): UnknownFact {
  return { known: false, reason: 'unknown', detail, observedAt: null }
}

export function memberFactsFromRecords(input: {
  workspaceId: string
  sshBlocked: boolean
  gitEntries: readonly unknown[] | null | undefined
  pullRequest: PullRequestFact | 'none' | null
  agent: 'working' | 'monitoring' | 'permission' | 'none' | null
  agentObservedAt?: number | null
}): MemberFacts {
  if (input.sshBlocked) {
    return unavailableMemberFacts(input.workspaceId, 'ssh-preview-disabled')
  }
  const git =
    input.gitEntries == null
      ? unknown()
      : known(input.gitEntries.length > 0 ? 'dirty' : 'clean', null)
  const pr =
    input.pullRequest == null
      ? unknown()
      : input.pullRequest === 'none'
        ? known('none', null)
        : input.pullRequest.error
          ? {
              known: false as const,
              reason: 'error' as const,
              detail: input.pullRequest.error,
              observedAt: input.pullRequest.observedAt
            }
          : known(input.pullRequest.state, input.pullRequest.observedAt)
  const review =
    input.pullRequest == null
      ? unknown()
      : input.pullRequest === 'none'
        ? known('no', null)
        : input.pullRequest.reviewDecision == null
          ? unknown()
          : known(
              input.pullRequest.reviewDecision === 'REVIEW_REQUIRED' ? 'yes' : 'no',
              input.pullRequest.observedAt
            )
  const checks =
    input.pullRequest == null
      ? unknown()
      : input.pullRequest === 'none'
        ? known('none', null)
        : input.pullRequest.checksStatus == null
          ? unknown()
          : known(
              input.pullRequest.checksStatus === 'failure'
                ? 'failing'
                : input.pullRequest.checksStatus === 'pending'
                  ? 'pending'
                  : input.pullRequest.checksStatus === 'success'
                    ? 'passing'
                    : 'none',
              input.pullRequest.observedAt
            )
  const agent = input.agent == null ? unknown() : known(input.agent, input.agentObservedAt ?? null)
  return { workspaceId: input.workspaceId, git, pr, reviewRequested: review, checks, agent }
}
