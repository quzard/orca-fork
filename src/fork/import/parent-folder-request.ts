import type { ForkPostImportDetails } from '../../shared/fork-hooks/post-import'

const PARENT_FOLDER_IMPORTED_STATUS = 'imported'
const PARENT_FOLDER_KNOWN_STATUS = 'already-known'

/** A non-git parent is added only after at least one selected child was kept. */
export function parentFolderImportRequested(
  details: Pick<ForkPostImportDetails, 'includeParentFolder' | 'path' | 'importedProjects'>
): boolean {
  if (!details.includeParentFolder || !details.path) {
    return false
  }
  return (details.importedProjects ?? []).some(
    (project) =>
      project.status === PARENT_FOLDER_IMPORTED_STATUS ||
      project.status === PARENT_FOLDER_KNOWN_STATUS
  )
}
