// fork: a markdown preview of a host-granted file (a terminal link outside every workspace on a
// paired server) reads through the source tab's grant. Without it the preview has no authority
// to read the server path and the editor refuses it as an external local file.
import {
  registerMarkdownPreviewSourceFields,
  type ForkMarkdownPreviewSourceFields,
  type ForkMarkdownPreviewSourceTab
} from '../../shared/fork-hooks/markdown-preview-source-fields'

export function markdownPreviewGrantFields(
  source: ForkMarkdownPreviewSourceTab
): ForkMarkdownPreviewSourceFields {
  const grantId = source.terminalArtifactGrantId
  // Why: the grant is read-only on the host, so the preview stays read-only like its source.
  return grantId ? { terminalArtifactGrantId: grantId, readOnly: true } : {}
}

export function registerMarkdownPreviewGrant(): void {
  registerMarkdownPreviewSourceFields(markdownPreviewGrantFields)
}
