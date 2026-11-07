import { describe, expect, it } from 'vitest'
import { needsMeCounts, needsMeReasons, unavailableMemberFacts, isQuietMember } from './badges'
import { memberFactsFromRecords } from './member-facts'
import {
  emptyRequirementSession,
  enterRequirementMember,
  openRequirementOverview,
  shouldLoadMemberChanges,
  shouldLoadReviewFiles,
  toggleReviewFile
} from './overview-session'
import { orderRequirementRows, type RequirementRow } from './requirements'
import { requirementsForSidebar } from './sidebar-model'
import { collapseNestedWorktreeEntries } from './scm-collapse'

const row = (id: string, name: string, role: 'root' | 'member' = 'member'): RequirementRow => ({
  id,
  hostId: 'local',
  name,
  path: `/srv/wt/${name}`,
  archived: false,
  kind: 'git',
  role,
  lineage: role === 'root' ? 'root' : 'confirmed'
})

describe('requirement overview facts', () => {
  it('keeps the terminal epoch when the overview opens and when a workspace is re-entered', () => {
    const opened = openRequirementOverview(emptyRequirementSession(), 'folder:parent')
    expect(opened.terminalEpoch).toBe(0)
    expect(opened.activeWorkspaceId).toBeNull()
    const first = enterRequirementMember(opened, 'wt-catalog')
    expect(first.terminalEpoch).toBe(1)
    expect(first.activeWorkspaceId).toBe('wt-catalog')
    expect(first.openRequirementId).toBeNull()
    const again = enterRequirementMember(
      { ...first, openRequirementId: 'folder:parent' },
      'wt-catalog'
    )
    expect(again.terminalEpoch).toBe(1)
    expect(shouldLoadMemberChanges(false)).toBe(false)
    expect(shouldLoadReviewFiles([])).toBe(false)
    expect(
      shouldLoadReviewFiles([{ workspaceId: 'a', relativePath: 'a.ts', source: 'uncommitted' }])
    ).toBe(false)
  })

  it('counts needs-me once per workspace and keeps a member named root distinct', () => {
    const failing = memberFactsFromRecords({
      workspaceId: 'wt-catalog',
      sshBlocked: false,
      gitEntries: [{ path: 'src/a.ts' }],
      pullRequest: {
        state: 'open',
        reviewDecision: 'REVIEW_REQUIRED',
        checksStatus: 'failure',
        observedAt: 10
      },
      agent: 'permission',
      agentObservedAt: 10
    })
    const quiet = memberFactsFromRecords({
      workspaceId: 'wt-root',
      sshBlocked: false,
      gitEntries: [],
      pullRequest: 'none',
      agent: 'none'
    })
    const ssh = unavailableMemberFacts('wt-remote', 'ssh-preview-disabled')
    expect(needsMeReasons(failing)).toEqual([
      'failing-checks',
      'review-requested',
      'agent-attention'
    ])
    expect(isQuietMember(quiet)).toBe(true)
    expect(ssh.git).toMatchObject({ known: false, reason: 'unavailable' })
    const counts = needsMeCounts({
      requirements: [
        { id: 'folder:parent', workspaceIds: ['folder:parent', 'wt-catalog', 'wt-root'] },
        { id: 'folder:other', workspaceIds: ['wt-catalog'] }
      ],
      reasonsByWorkspace: new Map([
        ['wt-catalog', needsMeReasons(failing)],
        ['wt-root', []],
        ['folder:parent', []]
      ]),
      visibleWorkspaceIds: ['folder:parent', 'wt-catalog', 'wt-root'],
      filtered: false
    })
    expect(counts.host).toBe(1)
    expect(counts.byRequirement['folder:parent']).toBe(1)
    expect(counts.table).toBe(1)
    const ordered = orderRequirementRows(
      [row('wt-root', 'root'), row('folder:parent', 'alpha', 'root'), row('wt-catalog', 'catalog')],
      { query: '', showInactive: false, quietIds: new Set(['wt-root']) }
    )
    expect(ordered.visible.map((entry) => entry.id)).toEqual(['folder:parent', 'wt-catalog'])
    expect(ordered.folded.map((entry) => entry.name)).toEqual(['root'])
  })

  it('groups a folder parent stored only on workspace lineage', () => {
    const requirements = requirementsForSidebar({
      worktrees: [
        {
          id: 'repo::/srv/catalog',
          path: '/srv/requirement-alpha/catalog',
          displayName: 'catalog',
          hostId: 'local',
          instanceId: 'c1'
        }
      ],
      folders: [
        {
          id: 'parent',
          name: 'requirement-alpha',
          folderPath: '/srv/requirement-alpha',
          executionHostId: 'local',
          isArchived: false
        }
      ],
      lineageById: {},
      workspaceLineage: [
        {
          childWorkspaceKey: 'worktree:repo::/srv/catalog',
          childInstanceId: 'c1',
          parentWorkspaceKey: 'folder:parent',
          parentInstanceId: null
        }
      ]
    })
    expect(requirements.map((requirement) => requirement.id)).toEqual(['folder:parent'])
    expect(requirements[0]?.rows.map((row) => row.lineage)).toEqual(['root', 'confirmed'])
  })

  it('collapses nested worktree paths and keeps parent docs', () => {
    const collapsed = collapseNestedWorktreeEntries(
      [
        { path: 'docs/overview.md' },
        { path: '.gitmodules' },
        { path: 'catalog', submodule: { commitChanged: true } },
        { path: 'catalog/src/a.ts' },
        { path: 'root/README.md' }
      ],
      ['catalog', 'root']
    )
    expect(collapsed.kept.map((entry) => entry.path)).toEqual(['docs/overview.md', '.gitmodules'])
    expect(collapsed.collapsedRoots).toEqual(['catalog', 'root'])
    const picked = toggleReviewFile([], {
      workspaceId: 'wt-catalog',
      relativePath: 'src/a.ts',
      source: 'uncommitted'
    })
    expect(
      toggleReviewFile(picked, {
        workspaceId: 'wt-root',
        relativePath: 'lib/b.ts',
        source: 'relative-base'
      })
    ).toHaveLength(2)
  })
})
