// 徽章只使用调用方给出的事实。没有的字段保持未知，不从终端文本推断。

export const NEEDS_ME_REASONS = ['failing-checks', 'review-requested', 'agent-attention'] as const
export type NeedsMeReason = (typeof NEEDS_ME_REASONS)[number]

export type KnownFact<T extends string> = {
  known: true
  value: T
  observedAt: number | null
}

export type UnknownFact = {
  known: false
  reason: 'unknown' | 'unavailable' | 'error' | 'stale'
  detail?: string
  observedAt: number | null
}

export type Fact<T extends string> = KnownFact<T> | UnknownFact

export type MemberFacts = {
  workspaceId: string
  git: Fact<'clean' | 'dirty'>
  pr: Fact<'open' | 'merged' | 'closed' | 'draft' | 'none'>
  reviewRequested: Fact<'yes' | 'no'>
  checks: Fact<'passing' | 'failing' | 'pending' | 'none'>
  agent: Fact<'working' | 'monitoring' | 'permission' | 'none'>
}

export type BadgeCounts = {
  host: number
  byRequirement: Record<string, number>
  table: number
  tableScope: 'all' | 'filtered'
}

const unavailable = (detail: string): UnknownFact => ({
  known: false,
  reason: 'unavailable',
  detail,
  observedAt: null
})

export function unavailableMemberFacts(workspaceId: string, detail: string): MemberFacts {
  return {
    workspaceId,
    git: unavailable(detail),
    pr: unavailable(detail),
    reviewRequested: unavailable(detail),
    checks: unavailable(detail),
    agent: unavailable(detail)
  }
}

export function needsMeReasons(facts: MemberFacts): NeedsMeReason[] {
  const reasons: NeedsMeReason[] = []
  if (facts.checks.known && facts.checks.value === 'failing') {
    reasons.push('failing-checks')
  }
  if (facts.reviewRequested.known && facts.reviewRequested.value === 'yes') {
    reasons.push('review-requested')
  }
  if (facts.agent.known && facts.agent.value === 'permission') {
    reasons.push('agent-attention')
  }
  return reasons
}

export function isQuietMember(facts: MemberFacts): boolean {
  return (
    facts.git.known &&
    facts.git.value === 'clean' &&
    facts.pr.known &&
    facts.pr.value === 'none' &&
    facts.checks.known &&
    facts.checks.value === 'none' &&
    facts.agent.known &&
    facts.agent.value === 'none' &&
    facts.reviewRequested.known &&
    facts.reviewRequested.value === 'no'
  )
}

export function needsMeCounts(input: {
  requirements: readonly { id: string; workspaceIds: readonly string[] }[]
  reasonsByWorkspace: ReadonlyMap<string, readonly NeedsMeReason[]>
  visibleWorkspaceIds: readonly string[]
  filtered: boolean
}): BadgeCounts {
  const needing = (ids: readonly string[]): Set<string> => {
    const set = new Set<string>()
    for (const id of ids) {
      const reasons = input.reasonsByWorkspace.get(id)
      if (reasons && reasons.length > 0) {
        set.add(id)
      }
    }
    return set
  }
  const host = new Set<string>()
  const byRequirement: Record<string, number> = {}
  for (const requirement of input.requirements) {
    const ids = needing(requirement.workspaceIds)
    byRequirement[requirement.id] = ids.size
    for (const id of ids) {
      host.add(id)
    }
  }
  return {
    host: host.size,
    byRequirement,
    table: needing(input.visibleWorkspaceIds).size,
    tableScope: input.filtered ? 'filtered' : 'all'
  }
}
