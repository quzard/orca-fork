// fork: fields a markdown preview tab copies from its source tab. Unregistered: none.

export type ForkMarkdownPreviewSourceTab = {
  id: string
  terminalArtifactGrantId?: string
}

export type ForkMarkdownPreviewSourceFields = {
  terminalArtifactGrantId?: string
  readOnly?: boolean
}

type SourceFieldsResolver = (
  source: ForkMarkdownPreviewSourceTab
) => ForkMarkdownPreviewSourceFields

const NONE: ForkMarkdownPreviewSourceFields = Object.freeze({})

let resolver: SourceFieldsResolver | undefined

export function registerMarkdownPreviewSourceFields(next: SourceFieldsResolver | undefined): void {
  resolver = next
}

/** Unregistered, returns the same empty object without looking up the source tab. */
export function forkMarkdownPreviewSourceFields(
  openFiles: readonly ForkMarkdownPreviewSourceTab[],
  sourceFileId: string
): ForkMarkdownPreviewSourceFields {
  if (!resolver) {
    return NONE
  }
  const source = openFiles.find((file) => file.id === sourceFileId)
  return source ? resolver(source) : NONE
}
