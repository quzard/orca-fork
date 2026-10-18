// Reads the open composer and remembers the host and sidebar group for the create.
import { useAppStore } from '@/store'
import { getAllWorktreesFromState } from '@/store/selectors'
import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId
} from '../../shared/execution-host'
import {
  composerSeedForOpen,
  registerComposerSeedReader,
  registerCreatedSidebarGroupAssigner
} from '../../shared/fork-hooks/workspace-composer-seed'
import { projectGroupHostId, resolveSidebarGroupId } from './membership'

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function registerComposerSeed(): void {
  registerComposerSeedReader(() => {
    const state = useAppStore.getState()
    if (state.activeModal !== 'new-workspace-composer') {
      return null
    }
    const data = state.modalData
    const explicitHost = parseExecutionHostId(stringField(data, 'initialExecutionHostId') ?? '')
    const groupId = stringField(data, 'initialProjectGroupId')
    const group = groupId ? state.projectGroups.find((entry) => entry.id === groupId) : undefined
    const active = getAllWorktreesFromState(state).find(
      (worktree) => worktree.id === state.activeWorktreeId
    )
    const activeRepo = active
      ? state.repos.find(
          (repo) =>
            repo.id === active.repoId &&
            getRepoExecutionHostId(repo) === getWorktreeExecutionHostId(active, undefined)
        )
      : undefined
    const activeHostId = active
      ? getWorktreeExecutionHostId(active, activeRepo)
      : (state.activeWorkspaceExecutionHostId ?? LOCAL_EXECUTION_HOST_ID)
    const groupsById = new Map(state.projectGroups.map((entry) => [entry.id, entry]))
    const activeGroupId = active
      ? resolveSidebarGroupId({
          sidebarGroupId: active.sidebarGroupId,
          inheritedGroupId: activeRepo?.projectGroupId,
          groupsById,
          hostId: activeHostId,
          defaultHostId: LOCAL_EXECUTION_HOST_ID
        })
      : null
    return composerSeedForOpen({
      telemetrySource: stringField(data, 'telemetrySource'),
      initialRepoId: stringField(data, 'initialRepoId'),
      initialProjectGroupId: groupId,
      hasWorkspaceTarget: data.initialWorkspaceTarget != null,
      hasWorkspaceStatus: data.initialWorkspaceStatus != null,
      explicitHostId: explicitHost?.id ?? null,
      explicitGroupId: stringField(data, 'targetSidebarGroupId') ?? null,
      groupHostId: group ? projectGroupHostId(group, LOCAL_EXECUTION_HOST_ID) : null,
      activeHostId,
      activeGroupId
    })
  })
  registerCreatedSidebarGroupAssigner(async (worktreeId, sidebarGroupId, hostId) => {
    await useAppStore
      .getState()
      .updateWorktreeMeta(
        worktreeId,
        { sidebarGroupId },
        hostId ? { executionHostId: hostId } : undefined
      )
  })
}
