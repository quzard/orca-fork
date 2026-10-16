// Archived Orca workspaces inside the visibility dialog. Restore clears isArchived.
import React, { useMemo, useState } from 'react'
import { translate } from '../../renderer/src/i18n/i18n'
import { Button } from '../../renderer/src/components/ui/button'
import { Input } from '../../renderer/src/components/ui/input'
import { getWorktreeExecutionHostId, normalizeExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { useAppStore } from '../../renderer/src/store'
import { registerVisibilityArchivedSlot } from '../../shared/fork-hooks/sidebar-chrome'

function ArchivedWorkspaceList({
  repo,
  hostId
}: {
  repo: Repo
  hostId?: string
}): React.JSX.Element | null {
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const updateWorktreeMeta = useAppStore((state) => state.updateWorktreeMeta)
  const [query, setQuery] = useState('')
  const archived = useMemo(() => {
    const owner =
      normalizeExecutionHostId(hostId) ?? getWorktreeExecutionHostId({ hostId: undefined }, repo)
    return Object.values(worktreesByRepo)
      .flat()
      .filter(
        (worktree) =>
          worktree.isArchived && getWorktreeExecutionHostId(worktree, repo, owner) === owner
      )
  }, [hostId, repo, worktreesByRepo])
  const needle = query.trim().toLocaleLowerCase()
  const visible = needle
    ? archived.filter((worktree) =>
        [worktree.displayName, worktree.path, worktree.branch, worktree.repoId]
          .join('\n')
          .toLocaleLowerCase()
          .includes(needle)
      )
    : archived
  if (archived.length === 0) {
    return null
  }
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="text-sm font-medium">
        {translate('fork.sidebar.archivedWorkspaces', 'Removed from Orca ({{value0}})', {
          value0: archived.length
        })}
      </h3>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={translate('fork.sidebar.searchWorkspaces', 'Search workspaces')}
        aria-label={translate('fork.sidebar.searchWorkspaces', 'Search workspaces')}
      />
      <ul className="grid gap-1">
        {visible.map((worktree) => (
          <li key={worktree.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{worktree.displayName}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void updateWorktreeMeta(
                  worktree.id,
                  { isArchived: false },
                  { executionHostId: worktree.hostId }
                )
              }}
            >
              {translate('fork.sidebar.restoreWorkspace', 'Restore')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function registerArchivedWorkspaceSlot(): void {
  registerVisibilityArchivedSlot((args) => (
    <ArchivedWorkspaceList repo={args.repo} hostId={args.hostId} />
  ))
}
