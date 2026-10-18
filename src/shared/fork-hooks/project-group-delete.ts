// fork: 删除项目群组对话框的附加选项。未注册时不渲染，删除参数保持原值。

import type { PersistedState } from '../persisted-state-types'

export type DeleteProjectGroupDialogOption = {
  id: string
  label: string
  description?: string
  defaultChecked?: boolean
  adjustRemoveContainedProjects?: (removeContainedProjects: boolean, checked: boolean) => boolean
}

let option: DeleteProjectGroupDialogOption | undefined
let optionChecked = false

export function registerDeleteProjectGroupDialogOption(next: DeleteProjectGroupDialogOption): void {
  option = next
  optionChecked = next.defaultChecked === true
}

export function getDeleteProjectGroupDialogOption(): DeleteProjectGroupDialogOption | undefined {
  return option
}

export function setDeleteProjectGroupDialogOptionChecked(checked: boolean): void {
  optionChecked = checked
}

export function resolveDeleteProjectGroupRemoveContainedProjects(
  removeContainedProjects: boolean
): boolean {
  if (!option?.adjustRemoveContainedProjects) {
    return removeContainedProjects
  }
  return option.adjustRemoveContainedProjects(removeContainedProjects, optionChecked)
}

let keepFolderWorkspaces = false

export function registerKeepFolderWorkspacesOnProjectGroupDelete(): void {
  keepFolderWorkspaces = true
}

export function projectGroupDeleteKeepsFolderWorkspaces(): boolean {
  return keepFolderWorkspaces
}

// Main process: what deleting a group does to its folder workspaces. Unregistered, upstream deletes
// them with the group.
type KeepFolderWorkspacesOnGroupDelete = (
  state: PersistedState,
  deletedGroupIds: ReadonlySet<string>
) => () => void

let keepOnGroupDelete: KeepFolderWorkspacesOnGroupDelete | undefined

export function registerKeepFolderWorkspacesOnGroupDeleteInMain(
  next: KeepFolderWorkspacesOnGroupDelete
): void {
  keepOnGroupDelete = next
}

/**
 * Called before the groups leave `state`. Returns the step that keeps their folder workspaces
 * (run it once the groups are gone, instead of upstream's removal), or null when unregistered.
 */
export function prepareKeepFolderWorkspacesOnGroupDelete(
  state: PersistedState,
  deletedGroupIds: ReadonlySet<string>
): (() => void) | null {
  return keepOnGroupDelete ? keepOnGroupDelete(state, deletedGroupIds) : null
}

/** True when a folder workspace may outlive its owning group (loading keeps it). */
export function folderWorkspacesMayOutliveTheirGroup(): boolean {
  return keepOnGroupDelete !== undefined
}
