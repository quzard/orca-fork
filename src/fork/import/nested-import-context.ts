import type {
  ForkImportedProject,
  ForkPostImportContext
} from '../../shared/fork-hooks/post-import'

const NON_GIT_PARENT_PATH_KIND = 'non_git_folder'

/** Context the nested-import handoff reads. A git parent does not add another folder. */
export function nestedHandoff(
  scan: { selectedPath: string; selectedPathKind: string },
  projectPaths: readonly string[],
  result: { projects: readonly ForkImportedProject[] },
  connectionId: string | null,
  runtimeEnvironmentId: string | null
): ForkPostImportContext {
  return {
    path: scan.selectedPath,
    projectPaths,
    includeParentFolder: scan.selectedPathKind === NON_GIT_PARENT_PATH_KIND,
    connectionId,
    runtimeEnvironmentId,
    importedProjects: result.projects.map((project) => ({
      path: project.worktreePath ?? project.path,
      projectId: project.projectId,
      status: project.status,
      ...(project.worktreePath ? { worktreePath: project.worktreePath } : {})
    }))
  }
}
