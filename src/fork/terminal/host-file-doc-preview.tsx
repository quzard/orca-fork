// F046: documents a paired host keeps outside the clicked workspace render in the doc preview.
// .tsx because it imports renderer aliases; the node project only includes src/fork/**/*.ts.
import { readHostFilePreview } from '@/runtime/runtime-terminal-artifact-read'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { registerHostFileDocPreview } from '../../shared/fork-hooks/host-file-doc-preview'

export function registerHostFileDocPreviews(): void {
  registerHostFileDocPreview({
    // The document's own folder bounds its relative URLs, as upstream does for SSH documents.
    location: ({ environmentId, worktreeId, worktreeRoot, root, entryRelativePath }) => ({
      owner: {
        kind: 'runtime',
        environmentId,
        worktreeSelector: toRuntimeWorktreeSelector(worktreeId),
        worktreeRoot
      },
      requestBase: root,
      root,
      entryRelativePath
    }),
    readDocumentResource: (target, worktreeId, absolutePath) =>
      readHostFilePreview({ target, worktreeId, absolutePath }),
    // Relative requests resolve against the document folder, not the clicked workspace root.
    folder: ({ owner, requestBase }) =>
      owner.kind === 'runtime' && owner.worktreeRoot !== requestBase ? requestBase : null
  })
}
