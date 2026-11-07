import { relative } from 'node:path'
import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { getLiveAgentStatusByWorktreeId } from '@/lib/worktree-activity-state'
import type { Worktree } from '../../shared/worktree/types'
import {
  registerRequirementHeaderOpen,
  registerRequirementHistory,
  registerRequirementOverview,
  registerRequirementScm
} from '../../shared/fork-hooks/requirement-preview'
import { forkTranslate } from '../i18n/fork-translate'
import { requirementPreviewSshRefusal } from '../requirement-preview/profile'
import { isQuietMember, needsMeCounts, needsMeReasons } from './badges'
import { applyVisiblePlan, dryRunRequirement, ImportSummary } from './import-actions'
import type { ImportPlan } from './import-plan'
import { memberFactsFromRecords } from './member-facts'
import { RequirementMembers } from './members-pane'
import {
  closeRequirementOverview,
  emptyOverviewUi,
  enterRequirementMember,
  openRequirementOverview,
  patchOverviewUi,
  toggleReviewFile
} from './overview-session'
import { updateRequirementSession, useRequirementSession } from './overview-store'
import { ReviewLoader } from './review-loader'
import {
  parseRequirementHeaderKey,
  requirementHistoryEntry,
  requirementIdFromHistory
} from './requirements'
import { requirementsForSidebar } from './sidebar-model'
import { collapseNestedWorktreeEntries } from './scm-collapse'

function liveAgentsAtRender(
  agentStatusByPaneKey: Parameters<typeof getLiveAgentStatusByWorktreeId>[0],
  tabsByWorktree: Parameters<typeof getLiveAgentStatusByWorktreeId>[1]
): ReturnType<typeof getLiveAgentStatusByWorktreeId> {
  return getLiveAgentStatusByWorktreeId(agentStatusByPaneKey, tabsByWorktree, Date.now())
}

function flattenWorktrees(worktreesByRepo: Record<string, Worktree[]> | undefined): Worktree[] {
  return Object.values(worktreesByRepo ?? {}).flat()
}

function memberRoots(worktreeId: string | null): string[] | null {
  if (!worktreeId) {
    return null
  }
  const state = useAppStore.getState()
  const requirement = requirementsForSidebar({
    worktrees: flattenWorktrees(state.worktreesByRepo),
    folders: state.folderWorkspaces,
    lineageById: state.worktreeLineageById
  }).find((entry) => entry.root.id === worktreeId)
  if (!requirement) {
    return null
  }
  return requirement.rows
    .filter((row) => row.role === 'member')
    .map((row) => relative(requirement.root.path, row.path))
    .filter((path) => path.length > 0 && !path.startsWith('..'))
}

export function registerRequirementSurfaces(): void {
  registerRequirementHeaderOpen((key) => {
    const parsed = parseRequirementHeaderKey(key)
    if (!parsed) {
      return false
    }
    updateRequirementSession((current) => openRequirementOverview(current, parsed.requirementId))
    const state = useAppStore.getState()
    if (!state.isNavigatingHistory) {
      state.recordWorktreeVisit(requirementHistoryEntry(parsed.requirementId))
    }
    return true
  })
  registerRequirementHistory({
    isEntry: (entry): entry is string =>
      typeof entry === 'string' && requirementIdFromHistory(entry) != null,
    activate: (entry) => {
      const id = requirementIdFromHistory(entry)
      if (id) {
        updateRequirementSession((current) => openRequirementOverview(current, id))
      }
    },
    dismiss: () => updateRequirementSession(closeRequirementOverview)
  })
  registerRequirementScm({
    project: (worktreeId, entries) => {
      const roots = memberRoots(worktreeId)
      return roots ? collapseNestedWorktreeEntries(entries, roots).kept : entries
    },
    note: (worktreeId) =>
      memberRoots(worktreeId)
        ? forkTranslate(
            'fork.requirement.collapsedWorktrees',
            'Nested worktrees are collapsed. This view does not stage them or run submodule commands.'
          )
        : null
  })
  registerRequirementOverview(() => <RequirementLayer />)
}

export function RequirementLayer(): React.JSX.Element | null {
  const session = useRequirementSession()
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const folders = useAppStore((state) => state.folderWorkspaces)
  const lineageById = useAppStore((state) => state.worktreeLineageById)
  const gitStatusByWorktree = useAppStore((state) => state.gitStatusByWorktree)
  const prCache = useAppStore((state) => state.prCache)
  const agentStatusByPaneKey = useAppStore((state) => state.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const worktrees = useMemo(() => flattenWorktrees(worktreesByRepo), [worktreesByRepo])
  const requirements = useMemo(
    () => requirementsForSidebar({ worktrees, folders, lineageById }),
    [folders, lineageById, worktrees]
  )
  const requirement = requirements.find((entry) => entry.id === session.openRequirementId) ?? null
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [reviewContents, setReviewContents] = useState<{
    left: string | null
    right: string | null
    error: string | null
  }>({ left: null, right: null, error: null })
  const agents = useMemo(
    () => liveAgentsAtRender(agentStatusByPaneKey, tabsByWorktree),
    [agentStatusByPaneKey, tabsByWorktree]
  )
  if (!requirement) {
    return null
  }
  const ui = session.uiByRequirement[requirement.id] ?? emptyOverviewUi()
  const sshBlocked = requirement.hostId.startsWith('ssh:') && requirementPreviewSshRefusal() != null
  const facts = new Map(
    requirement.rows.map((row) => {
      const worktree = worktrees.find((entry) => entry.id === row.id)
      const cached = worktree?.linkedPR
        ? Object.values(prCache).find((entry) => entry.data?.number === worktree.linkedPR)
        : undefined
      return [
        row.id,
        memberFactsFromRecords({
          workspaceId: row.id,
          sshBlocked,
          gitEntries: gitStatusByWorktree[row.id],
          pullRequest: worktree?.linkedPR
            ? cached?.data
              ? {
                  state: cached.data.state,
                  reviewDecision: cached.data.reviewDecision,
                  checksStatus: cached.data.checksStatus,
                  observedAt: cached.fetchedAt,
                  error: cached.error?.message
                }
              : null
            : 'none',
          agent: agentStatusByPaneKey ? (agents.get(row.id) ?? 'none') : null
        })
      ] as const
    })
  )
  const quietIds = new Set([...facts].filter(([, fact]) => isQuietMember(fact)).map(([id]) => id))
  const counts = needsMeCounts({
    requirements: requirements.map((entry) => ({
      id: entry.id,
      workspaceIds: entry.rows.map((row) => row.id)
    })),
    reasonsByWorkspace: new Map([...facts].map(([id, fact]) => [id, needsMeReasons(fact)])),
    visibleWorkspaceIds: requirement.rows
      .filter((row) => ui.showInactive || row.role === 'root' || !quietIds.has(row.id))
      .map((row) => row.id),
    filtered: ui.query.trim().length > 0 || !ui.showInactive
  })
  const reviewFiles = requirement.rows.flatMap((row) =>
    (gitStatusByWorktree[row.id] ?? []).flatMap((entry) => {
      const path = typeof entry === 'object' && entry && 'path' in entry ? String(entry.path) : ''
      return path
        ? [
            {
              ref: { workspaceId: row.id, relativePath: path, source: 'uncommitted' as const },
              label: `${row.name}: ${path}`
            }
          ]
        : []
    })
  )
  const enter = (workspaceId: string): void => {
    updateRequirementSession((current) => enterRequirementMember(current, workspaceId))
    useAppStore
      .getState()
      .setActiveWorktree(
        workspaceId,
        requirement.rows.find((row) => row.id === workspaceId)?.hostId
      )
  }
  return (
    <div className="absolute inset-0 z-20 flex min-h-0 flex-col gap-3 overflow-hidden bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">{requirement.name}</h1>
          <p className="text-xs text-muted-foreground">{requirement.root.path}</p>
        </div>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => updateRequirementSession(closeRequirementOverview)}
        >
          {forkTranslate('fork.requirement.close', 'Close')}
        </button>
      </div>
      {sshBlocked ? (
        <p className="text-sm text-muted-foreground">
          {forkTranslate(
            'fork.requirement.sshOff',
            'This preview does not contact remote agents. SSH status stays unavailable.'
          )}
        </p>
      ) : null}
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() =>
            updateRequirementSession((current) =>
              patchOverviewUi(current, requirement.id, { tab: 'members' })
            )
          }
        >
          {forkTranslate('fork.requirement.members', 'Members')}
        </button>
        <button
          type="button"
          onClick={() =>
            updateRequirementSession((current) =>
              patchOverviewUi(current, requirement.id, { tab: 'review' })
            )
          }
        >
          {forkTranslate('fork.requirement.review', 'Review')}
        </button>
        <button
          type="button"
          onClick={() => {
            void dryRunRequirement({
              parentPath: requirement.root.path,
              parentId: requirement.id,
              hostId: requirement.hostId,
              worktrees,
              folders,
              lineageById
            }).then((next) => {
              setPlan(next.plan)
              setImportNote(next.note)
            })
          }}
        >
          {forkTranslate('fork.requirement.dryRun', 'Dry run')}
        </button>
      </div>
      {plan ? (
        <ImportSummary
          plan={plan}
          note={importNote}
          onApply={() => {
            void applyVisiblePlan(plan, requirement.id)
              .then((note) => setImportNote(note))
              .catch((error: unknown) =>
                setImportNote(error instanceof Error ? error.message : 'apply-failed')
              )
          }}
        />
      ) : null}
      {ui.tab === 'review' ? (
        <ReviewLoader
          files={reviewFiles}
          selected={ui.reviewFiles}
          mode={ui.reviewMode}
          worktrees={worktrees}
          folders={folders}
          contents={reviewContents}
          onContents={setReviewContents}
          onToggle={(file) =>
            updateRequirementSession((current) =>
              patchOverviewUi(current, requirement.id, {
                reviewFiles: toggleReviewFile(ui.reviewFiles, file)
              })
            )
          }
          onMode={(mode) =>
            updateRequirementSession((current) =>
              patchOverviewUi(current, requirement.id, { reviewMode: mode })
            )
          }
        />
      ) : (
        <RequirementMembers
          requirement={requirement}
          ui={ui}
          facts={facts}
          needsMe={counts.byRequirement[requirement.id] ?? 0}
          hostNeedsMe={counts.host}
          tableNeedsMe={counts.table}
          tableScope={counts.tableScope}
          quietIds={quietIds}
          onUi={(patch) =>
            updateRequirementSession((current) => patchOverviewUi(current, requirement.id, patch))
          }
          onEnter={enter}
        />
      )}
    </div>
  )
}
