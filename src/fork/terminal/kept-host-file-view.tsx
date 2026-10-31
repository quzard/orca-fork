// F046: a paired host's file that another workspace holds stays in the clicked workspace, read-only.
// .tsx because it imports renderer aliases; the node project only includes src/fork/**/*.ts.
import {
  acquireTerminalArtifactGrant,
  pinTerminalArtifactGrantTarget
} from '@/runtime/runtime-terminal-artifact-grant'
import { isFloatingWorkspaceId } from '../../shared/floating-workspace-worktree'
import type { RuntimeTerminalPathResolution } from '../../shared/runtime-file-contracts'
import {
  registerKeptHostFileViews,
  type KeptHostFile,
  type KeptHostFileSource,
  type KeptHostFileTab
} from '../../shared/fork-hooks/kept-host-file-view'

async function keepInClickedWorkspace(
  { target, worktreeId }: KeptHostFileSource,
  resolved: RuntimeTerminalPathResolution
): Promise<KeptHostFile | null> {
  if (target.kind !== 'environment' || !worktreeId || isFloatingWorkspaceId(worktreeId)) {
    return null
  }
  // Folders and workspace roots keep upstream's activation of the owning workspace.
  if (resolved.isDirectory || !resolved.relativePath || !resolved.absolutePath) {
    return null
  }
  if (resolved.worktree === worktreeId) {
    return null
  }
  try {
    // Without crossWorkspace the clicked workspace's host grants the path like any outside file.
    const granted = await acquireTerminalArtifactGrant(
      pinTerminalArtifactGrantTarget({ target, worktreeId, absolutePath: resolved.absolutePath })
    )
    return granted
      ? {
          kind: 'grant',
          absolutePath: granted.absolutePath,
          grantId: granted.grantId,
          isDirectory: false,
          readOnly: true
        }
      : null
  } catch {
    // Hosts before #33958 grant only what their terminals printed; they still switch workspaces.
    return null
  }
}

function isKeptView(file: KeptHostFileTab): boolean {
  return (
    file.readOnly === true &&
    file.relativePath === file.filePath &&
    Boolean(file.runtimeEnvironmentId?.trim())
  )
}

export function registerKeptHostFileViewHooks(): void {
  registerKeptHostFileViews({ keep: keepInClickedWorkspace, isKeptView })
}
