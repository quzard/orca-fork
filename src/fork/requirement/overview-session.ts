// 概览自己的导航和界面状态。打开概览不增加终端世代，也不改当前工作区。

export type OverviewTab = 'members' | 'review'

export type ReviewFileRef = {
  workspaceId: string
  relativePath: string
  source: 'uncommitted' | 'relative-base'
}

export type OverviewUi = {
  tab: OverviewTab
  query: string
  showInactive: boolean
  selectedWorkspaceId: string | null
  scrollTop: number
  reviewFiles: ReviewFileRef[]
  reviewMode: 'diff' | 'content'
}

export type RequirementSession = {
  openRequirementId: string | null
  activeWorkspaceId: string | null
  visitedWorkspaces: string[]
  terminalEpoch: number
  uiByRequirement: Record<string, OverviewUi>
}

export function emptyOverviewUi(): OverviewUi {
  return {
    tab: 'members',
    query: '',
    showInactive: false,
    selectedWorkspaceId: null,
    scrollTop: 0,
    reviewFiles: [],
    reviewMode: 'diff'
  }
}

export function emptyRequirementSession(): RequirementSession {
  return {
    openRequirementId: null,
    activeWorkspaceId: null,
    visitedWorkspaces: [],
    terminalEpoch: 0,
    uiByRequirement: {}
  }
}

function uiOf(session: RequirementSession, requirementId: string): OverviewUi {
  return session.uiByRequirement[requirementId] ?? emptyOverviewUi()
}

export function openRequirementOverview(
  session: RequirementSession,
  requirementId: string
): RequirementSession {
  return {
    ...session,
    openRequirementId: requirementId,
    uiByRequirement: {
      ...session.uiByRequirement,
      [requirementId]: uiOf(session, requirementId)
    }
  }
}

export function patchOverviewUi(
  session: RequirementSession,
  requirementId: string,
  patch: Partial<OverviewUi>
): RequirementSession {
  return {
    ...session,
    uiByRequirement: {
      ...session.uiByRequirement,
      [requirementId]: { ...uiOf(session, requirementId), ...patch }
    }
  }
}

/** 进入成员走原来的工作区。已经打开过的不增加终端世代。 */
export function enterRequirementMember(
  session: RequirementSession,
  workspaceId: string
): RequirementSession {
  const visited = session.visitedWorkspaces.includes(workspaceId)
  return {
    ...session,
    openRequirementId: null,
    activeWorkspaceId: workspaceId,
    visitedWorkspaces: visited
      ? session.visitedWorkspaces
      : [...session.visitedWorkspaces, workspaceId],
    terminalEpoch: visited ? session.terminalEpoch : session.terminalEpoch + 1
  }
}

export function closeRequirementOverview(session: RequirementSession): RequirementSession {
  return { ...session, openRequirementId: null }
}

/** 任意两个文件。第三次选择替换更早的一个。 */
export function toggleReviewFile(
  files: readonly ReviewFileRef[],
  file: ReviewFileRef
): ReviewFileRef[] {
  const index = files.findIndex(
    (entry) =>
      entry.workspaceId === file.workspaceId &&
      entry.relativePath === file.relativePath &&
      entry.source === file.source
  )
  if (index !== -1) {
    return files.filter((_, entry) => entry !== index)
  }
  return [...files, file].slice(-2)
}

export function shouldLoadReviewFiles(files: readonly ReviewFileRef[]): boolean {
  return files.length === 2
}

export function shouldLoadMemberChanges(expanded: boolean): boolean {
  return expanded
}
