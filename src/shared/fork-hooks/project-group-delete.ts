// fork: 删除项目群组对话框的附加选项。未注册时不渲染，删除参数保持原值。

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
