import type { MemberFacts } from './badges'
import { needsMeReasons } from './badges'
import type { Requirement } from './requirements'
import { orderRequirementRows, requirementRowLabel } from './requirements'
import type { OverviewUi } from './overview-session'
import { forkTranslate } from '../i18n/fork-translate'

function factText(fact: {
  known: boolean
  value?: string
  reason?: string
  observedAt: number | null
}): string {
  if (!fact.known) {
    return fact.reason === 'unavailable'
      ? forkTranslate('fork.requirement.unavailable', 'Unavailable')
      : fact.reason === 'error'
        ? forkTranslate('fork.requirement.error', 'Error')
        : fact.reason === 'stale'
          ? forkTranslate('fork.requirement.stale', 'Stale')
          : forkTranslate('fork.requirement.unknown', 'Unknown')
  }
  const when =
    fact.observedAt == null ? forkTranslate('fork.requirement.timeUnknown', 'time unknown') : ''
  return when ? `${fact.value} (${when})` : (fact.value ?? '')
}

export function RequirementMembers(props: {
  requirement: Requirement
  ui: OverviewUi
  facts: ReadonlyMap<string, MemberFacts>
  needsMe: number
  hostNeedsMe: number
  tableNeedsMe: number
  tableScope: 'all' | 'filtered'
  quietIds: ReadonlySet<string>
  onUi: (patch: Partial<OverviewUi>) => void
  onEnter: (workspaceId: string) => void
}): React.JSX.Element {
  const ordered = orderRequirementRows(props.requirement.rows, {
    query: props.ui.query,
    showInactive: props.ui.showInactive,
    quietIds: props.quietIds
  })
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {forkTranslate('fork.requirement.needsMe', 'Needs me')} {props.needsMe}
        </span>
        <span className="text-muted-foreground">
          {forkTranslate('fork.requirement.hostCount', 'Host')} {props.hostNeedsMe}
        </span>
        <span className="text-muted-foreground">
          {forkTranslate('fork.requirement.tableCount', 'Table')} {props.tableNeedsMe}
          {props.tableScope === 'filtered'
            ? ` / ${props.needsMe} ${forkTranslate('fork.requirement.filtered', 'filtered')}`
            : ''}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          value={props.ui.query}
          placeholder={forkTranslate('fork.requirement.search', 'Search members')}
          onChange={(event) => props.onUi({ query: event.target.value })}
        />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={props.ui.showInactive}
            onChange={(event) => props.onUi({ showInactive: event.target.checked })}
          />
          {forkTranslate('fork.requirement.showInactive', 'Show inactive')}
        </label>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto rounded-md border border-border"
        onScroll={(event) => props.onUi({ scrollTop: event.currentTarget.scrollTop })}
      >
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-2 py-1">{forkTranslate('fork.requirement.member', 'Member')}</th>
              <th className="px-2 py-1">Git</th>
              <th className="px-2 py-1">PR</th>
              <th className="px-2 py-1">{forkTranslate('fork.requirement.checks', 'Checks')}</th>
              <th className="px-2 py-1">{forkTranslate('fork.requirement.agent', 'Agent')}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.visible.map((row) => {
              const facts = props.facts.get(row.id)
              const reasons = facts ? needsMeReasons(facts) : []
              const selected = props.ui.selectedWorkspaceId === row.id
              return (
                <tr
                  key={row.id}
                  data-requirement-role={row.role}
                  aria-selected={selected}
                  className={selected ? 'bg-accent/40' : undefined}
                  onClick={() => props.onUi({ selectedWorkspaceId: row.id })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      props.onEnter(row.id)
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-2 py-1">
                    <div className="font-medium">{requirementRowLabel(row)}</div>
                    <div className="truncate text-xs text-muted-foreground">{row.path}</div>
                    {row.lineage === 'stale' ? (
                      <div className="text-xs text-muted-foreground">
                        {forkTranslate('fork.requirement.staleLineage', 'Stale lineage')}
                      </div>
                    ) : null}
                    {reasons.length > 0 ? (
                      <div className="text-xs">{reasons.join(', ')}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1">
                    {facts
                      ? factText(facts.git)
                      : factText({ known: false, reason: 'unknown', observedAt: null })}
                  </td>
                  <td className="px-2 py-1">{facts ? factText(facts.pr) : ''}</td>
                  <td className="px-2 py-1">{facts ? factText(facts.checks) : ''}</td>
                  <td className="px-2 py-1">{facts ? factText(facts.agent) : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {ordered.folded.length > 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {forkTranslate('fork.requirement.folded', 'Inactive folded')}: {ordered.folded.length}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="h-8 self-start rounded-md border border-border px-3 text-sm"
        onClick={() => {
          if (props.ui.selectedWorkspaceId) {
            props.onEnter(props.ui.selectedWorkspaceId)
          }
        }}
      >
        {forkTranslate('fork.requirement.enter', 'Enter workspace')}
      </button>
    </div>
  )
}
