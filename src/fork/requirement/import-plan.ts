// 导入计划只描述映射。冲突不会自动改父级；没有回调的创建步骤保持跳过。
import { resolve } from 'node:path'
import type { DiscoveredCheckout } from './discover-members'

export type ImportProject = {
  id: string
  hostId: string
  gitCommonDir: string
}

export type ImportWorkspace = {
  id: string
  hostId: string
  path: string
  projectId: string | null
  visible: boolean
  lineageParentId: string | null
}

export type ImportRequest = {
  hostId: string
  parentPath: string
  parentWorkspaceId: string | null
  discovered: readonly DiscoveredCheckout[]
  projects: readonly ImportProject[]
  workspaces: readonly ImportWorkspace[]
}

export type ImportAction =
  | { op: 'reuse-parent'; workspaceId: string }
  | { op: 'reuse-project'; projectId: string; gitCommonDir: string }
  | { op: 'create-project'; gitCommonDir: string; projectPath: string }
  | { op: 'reuse-workspace'; workspaceId: string; path: string }
  | { op: 'adopt'; workspaceId: string; path: string }
  | { op: 'create-workspace'; path: string; projectId: string }
  | { op: 'link-lineage'; workspaceId: string; parentId: string }
  | { op: 'lineage-conflict'; workspaceId: string; parentId: string; existingParentId: string }
  | { op: 'unchanged-lineage'; workspaceId: string; parentId: string }

export type ImportPlan = {
  ok: boolean
  error?: 'parent-missing'
  actions: ImportAction[]
}

function same(left: string, right: string): boolean {
  return resolve(left) === resolve(right)
}

function projectPathForCommonDir(gitCommonDir: string): string {
  return gitCommonDir.endsWith('.git') ? resolve(gitCommonDir, '..') : resolve(gitCommonDir)
}

export function planRequirementImport(request: ImportRequest): ImportPlan {
  if (!request.parentWorkspaceId) {
    return { ok: false, error: 'parent-missing', actions: [] }
  }
  const parent = request.workspaces.find(
    (workspace) =>
      workspace.id === request.parentWorkspaceId &&
      workspace.hostId === request.hostId &&
      same(workspace.path, request.parentPath)
  )
  if (!parent) {
    return { ok: false, error: 'parent-missing', actions: [] }
  }
  const actions: ImportAction[] = [{ op: 'reuse-parent', workspaceId: parent.id }]
  const projects = [...request.projects]
  const workspaces = [...request.workspaces]
  const seenCommon = new Set<string>()
  for (const member of request.discovered) {
    if (member.kind !== 'linked-worktree' || !member.gitCommonDir) {
      continue
    }
    const common = resolve(member.gitCommonDir)
    let project = projects.find(
      (entry) => entry.hostId === request.hostId && same(entry.gitCommonDir, common)
    )
    if (!seenCommon.has(common)) {
      seenCommon.add(common)
      if (project) {
        actions.push({ op: 'reuse-project', projectId: project.id, gitCommonDir: common })
      } else {
        const projectPath = projectPathForCommonDir(common)
        actions.push({ op: 'create-project', gitCommonDir: common, projectPath })
        project = { id: `create:${common}`, hostId: request.hostId, gitCommonDir: common }
        projects.push(project)
      }
    }
    if (!project) {
      continue
    }
    const existing = workspaces.find(
      (workspace) => workspace.hostId === request.hostId && same(workspace.path, member.path)
    )
    let workspaceId: string
    if (existing) {
      workspaceId = existing.id
      actions.push(
        existing.visible
          ? { op: 'reuse-workspace', workspaceId, path: member.path }
          : { op: 'adopt', workspaceId, path: member.path }
      )
    } else {
      workspaceId = `create-workspace:${member.path}`
      actions.push({ op: 'create-workspace', path: member.path, projectId: project.id })
      workspaces.push({
        id: workspaceId,
        hostId: request.hostId,
        path: member.path,
        projectId: project.id,
        visible: true,
        lineageParentId: null
      })
    }
    const current = workspaces.find((workspace) => workspace.id === workspaceId)
    if (current?.lineageParentId && current.lineageParentId !== parent.id) {
      actions.push({
        op: 'lineage-conflict',
        workspaceId,
        parentId: parent.id,
        existingParentId: current.lineageParentId
      })
      continue
    }
    if (current?.lineageParentId === parent.id) {
      actions.push({ op: 'unchanged-lineage', workspaceId, parentId: parent.id })
      continue
    }
    actions.push({ op: 'link-lineage', workspaceId, parentId: parent.id })
    if (current) {
      current.lineageParentId = parent.id
    }
  }
  return { ok: true, actions }
}

export type ImportEffects = {
  adopt?: (workspaceId: string) => Promise<void>
  createProject?: (action: { gitCommonDir: string; projectPath: string }) => Promise<string>
  createWorkspace?: (action: { path: string; projectId: string }) => Promise<string>
  linkLineage?: (workspaceId: string, parentId: string) => Promise<void>
}

export type AppliedImport = {
  performed: ImportAction[]
  skipped: { action: ImportAction; reason: string }[]
}

/** 第二次对同一快照调用时，写操作应为零。冲突只跳过，不改父级。 */
export async function applyRequirementPlan(
  plan: ImportPlan,
  effects: ImportEffects
): Promise<AppliedImport> {
  const performed: ImportAction[] = []
  const skipped: AppliedImport['skipped'] = []
  if (!plan.ok) {
    return {
      performed,
      skipped: [
        { action: { op: 'reuse-parent', workspaceId: '' }, reason: plan.error ?? 'parent-missing' }
      ]
    }
  }
  for (const action of plan.actions) {
    if (action.op === 'lineage-conflict') {
      skipped.push({ action, reason: 'lineage-conflict' })
      continue
    }
    if (action.op === 'adopt') {
      if (!effects.adopt) {
        skipped.push({ action, reason: 'adopt-unavailable' })
        continue
      }
      await effects.adopt(action.workspaceId)
    } else if (action.op === 'create-project') {
      if (!effects.createProject) {
        skipped.push({ action, reason: 'create-project-unavailable' })
        continue
      }
      await effects.createProject(action)
    } else if (action.op === 'create-workspace') {
      if (!effects.createWorkspace) {
        skipped.push({ action, reason: 'create-workspace-unavailable' })
        continue
      }
      await effects.createWorkspace(action)
    } else if (action.op === 'link-lineage') {
      if (!effects.linkLineage) {
        skipped.push({ action, reason: 'link-unavailable' })
        continue
      }
      await effects.linkLineage(action.workspaceId, action.parentId)
    }
    performed.push(action)
  }
  return { performed, skipped }
}
