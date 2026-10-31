// F046: documents a paired host keeps outside the clicked workspace render in the doc preview.
// .tsx because it imports renderer aliases; the node project only includes src/fork/**/*.ts.
import { basename, dirname } from '@/lib/path'
import { findWorkspaceFileRoute } from '@/lib/runtime-workspace-file-route'
import { readHostFilePreview } from '@/runtime/runtime-terminal-artifact-read'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { useAppStore } from '@/store'
import { toRuntimeExecutionHostId } from '../../shared/execution-host'
import {
  registerHostFileDocPreview,
  type HostFileDocLocation
} from '../../shared/fork-hooks/host-file-doc-preview'

function documentLocation(args: {
  environmentId: string
  worktreeId: string
  worktreeRoot: string
  filePath: string
}): HostFileDocLocation {
  const { environmentId, filePath } = args
  const state = useAppStore.getState()
  const holder = findWorkspaceFileRoute(state, toRuntimeExecutionHostId(environmentId), filePath)
  const holderRoot = holder ? state.getKnownWorktreeById(holder.worktreeId)?.path : undefined
  const root = dirname(filePath)
  // Another workspace's document reads through that workspace, as upstream previews it there.
  if (holder && holderRoot) {
    return {
      owner: {
        kind: 'runtime',
        environmentId,
        worktreeSelector: toRuntimeWorktreeSelector(holder.worktreeId),
        worktreeRoot: holderRoot
      },
      requestBase: holderRoot,
      root,
      entryRelativePath: holder.relativePath
    }
  }
  // Outside every workspace only the document's folder is in reach, as upstream does for SSH.
  return {
    owner: {
      kind: 'runtime',
      environmentId,
      worktreeSelector: toRuntimeWorktreeSelector(args.worktreeId),
      worktreeRoot: args.worktreeRoot
    },
    requestBase: root,
    root,
    entryRelativePath: basename(filePath)
  }
}

export function registerHostFileDocPreviews(): void {
  registerHostFileDocPreview({
    location: documentLocation,
    readDocumentResource: (target, worktreeId, absolutePath) =>
      readHostFilePreview({ target, worktreeId, absolutePath }),
    folder: ({ owner, requestBase }) => (owner.kind === 'runtime' ? requestBase : null)
  })
}
