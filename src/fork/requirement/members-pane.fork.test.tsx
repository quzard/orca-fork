// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Requirement } from './requirements'
import { emptyOverviewUi } from './overview-session'
import { RequirementMembers } from './members-pane'
import { memberFactsFromRecords } from './member-facts'
import { unavailableMemberFacts } from './badges'

vi.mock('../i18n/fork-translate', () => ({
  forkTranslate: (_key: string, fallback: string) => fallback
}))

const requirement: Requirement = {
  id: 'folder:parent',
  hostId: 'ssh:devbox',
  name: 'requirement-alpha',
  root: {
    id: 'folder:parent',
    hostId: 'ssh:devbox',
    name: 'requirement-alpha',
    path: '/srv/wt/requirement-alpha',
    archived: false,
    kind: 'folder'
  },
  rows: [
    {
      id: 'folder:parent',
      hostId: 'ssh:devbox',
      name: 'requirement-alpha',
      path: '/srv/wt/requirement-alpha',
      archived: false,
      kind: 'folder',
      role: 'root',
      lineage: 'root'
    },
    {
      id: 'wt-root',
      hostId: 'ssh:devbox',
      name: 'root',
      path: '/srv/wt/requirement-alpha/root',
      archived: false,
      kind: 'git',
      role: 'member',
      lineage: 'confirmed'
    }
  ]
}

describe('requirement members pane', () => {
  it('does not enter a workspace on render and keeps 需求根 distinct from a member named root', () => {
    const enter = vi.fn()
    const facts = new Map([
      ['folder:parent', unavailableMemberFacts('folder:parent', 'ssh-preview-disabled')],
      [
        'wt-root',
        memberFactsFromRecords({
          workspaceId: 'wt-root',
          sshBlocked: true,
          gitEntries: [],
          pullRequest: 'none',
          agent: 'none'
        })
      ]
    ])
    render(
      <RequirementMembers
        requirement={requirement}
        ui={{ ...emptyOverviewUi(), showInactive: true }}
        facts={facts}
        needsMe={0}
        hostNeedsMe={0}
        tableNeedsMe={0}
        tableScope="all"
        quietIds={new Set()}
        onUi={() => undefined}
        onEnter={enter}
      />
    )
    expect(enter).not.toHaveBeenCalled()
    expect(screen.getByText('需求根')).toBeTruthy()
    expect(screen.getByText('root')).toBeTruthy()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Enter workspace' }))
    expect(enter).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByText('root').closest('tr')!, { key: 'Enter' })
    expect(enter).toHaveBeenCalledWith('wt-root')
    cleanup()
  })
})
