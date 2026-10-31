// fork: 创建弹窗的主机和分组。未登记时不改创建请求。

import type { ExecutionHostId } from '../execution-host'

export type ComposerSeed = {
  hostId?: ExecutionHostId
  sidebarGroupId?: string
}

export type ComposerSeedInput = {
  telemetrySource?: string
  initialRepoId?: string
  initialProjectGroupId?: string
  hasWorkspaceTarget: boolean
  hasWorkspaceStatus: boolean
  groupHostId: ExecutionHostId | null
  activeHostId: ExecutionHostId | null
  activeGroupId: string | null
}

let readSeed: (() => ComposerSeed | null) | undefined
let assignGroup:
  | ((
      worktreeId: string,
      sidebarGroupId: string,
      hostId: ExecutionHostId | undefined
    ) => Promise<void>)
  | undefined

export function registerComposerSeedReader(next: () => ComposerSeed | null): void {
  readSeed = next
}

export function registerCreatedSidebarGroupAssigner(
  next: (
    worktreeId: string,
    sidebarGroupId: string,
    hostId: ExecutionHostId | undefined
  ) => Promise<void>
): void {
  assignGroup = next
}

export function readComposerSeed(): ComposerSeed | null {
  return readSeed?.() ?? null
}

export function composerSeedForOpen(input: ComposerSeedInput): ComposerSeed | null {
  if (input.initialProjectGroupId && input.groupHostId) {
    return { hostId: input.groupHostId, sidebarGroupId: input.initialProjectGroupId }
  }
  if (
    input.telemetrySource === 'sidebar' &&
    !input.initialRepoId &&
    !input.initialProjectGroupId &&
    !input.hasWorkspaceTarget &&
    !input.hasWorkspaceStatus &&
    input.activeHostId
  ) {
    return {
      hostId: input.activeHostId,
      ...(input.activeGroupId ? { sidebarGroupId: input.activeGroupId } : {})
    }
  }
  return null
}

export function sidebarGroupIdForCreate(): string | undefined {
  return readComposerSeed()?.sidebarGroupId
}

export async function applyRegisteredSidebarGroup(
  worktreeId: string,
  sidebarGroupId: string | undefined,
  hostId: ExecutionHostId | undefined
): Promise<void> {
  if (!sidebarGroupId || !assignGroup) {
    return
  }
  await assignGroup(worktreeId, sidebarGroupId, hostId)
}
