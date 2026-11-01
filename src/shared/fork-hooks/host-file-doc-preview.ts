// fork: F046. A paired host's files outside the clicked workspace: HTML renders in the doc preview,
// read by absolute path on the host, and the editor reads files past a terminal grant's one reply
// in ranges. Unregistered, previews and reads stay upstream.
import type { DocPreviewFileFailureReason } from '../doc-preview-scheme'
import type { LocalFileAccess } from '../local-file-access'
import type { RuntimeClientTarget } from '../runtime-client-target'
import type { RuntimeFilePreviewResult } from '../runtime-file-contracts'

/** Host RPC: one file of such a preview, with upstream's files.readDocPreview limits and checks. */
export const HOST_DOC_PREVIEW_READ_METHOD = 'files.hostDocPreview.read'
/** Host RPC: a byte range of a file too large for one reply, as files.readDocPreviewChunk. */
export const HOST_DOC_PREVIEW_READ_CHUNK_METHOD = 'files.hostDocPreview.readChunk'
/** Host RPC: files.stat for an absolute path. */
export const HOST_FILE_STAT_METHOD = 'files.hostFile.stat'
/** Host RPC: files.readChunk for an absolute path. */
export const HOST_FILE_READ_CHUNK_METHOD = 'files.hostFile.readChunk'

/** Ranged reads share upstream's bulk lane, so a large file does not hold terminal or workspace slots. */
export function isHostFileBulkRead(method: string): boolean {
  return method === HOST_DOC_PREVIEW_READ_CHUNK_METHOD || method === HOST_FILE_READ_CHUNK_METHOD
}

export type HostFileDocLocation = {
  owner: { kind: 'runtime'; environmentId: string; worktreeSelector: string; worktreeRoot: string }
  requestBase: string
  root: string
  entryRelativePath: string
}

type HostFileDocPreviewRenderer = {
  location: (args: {
    environmentId: string
    worktreeId: string
    worktreeRoot: string
    filePath: string
  }) => HostFileDocLocation
  readDocumentResource: (
    target: RuntimeClientTarget & { kind: 'environment' },
    worktreeId: string,
    filePath: string
  ) => Promise<RuntimeFilePreviewResult>
}

export type HostFileDocPreviewOutcome =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; status: number; reason: DocPreviewFileFailureReason; message: string }

type HostFileDocPreviewReader = (
  grantId: string,
  absolutePath: string,
  contentType: string
) => Promise<HostFileDocPreviewOutcome>

/** A host file outside every workspace as the editor reads it, through its terminal grant. */
export type GrantedHostFile = {
  target: RuntimeClientTarget & { kind: 'environment' }
  worktreeId: string
  absolutePath: string
  grantId: string
  expectedEnvironmentPairingRevision?: number
}

type LargeHostFileReader = (
  file: GrantedHostFile,
  refusal: Error
) => Promise<RuntimeFilePreviewResult>

let renderer: HostFileDocPreviewRenderer | null = null
let reader: HostFileDocPreviewReader | null = null
let largeFileReader: LargeHostFileReader | null = null

export function registerHostFileDocPreview(next: HostFileDocPreviewRenderer): void {
  renderer = next
}

/** Main process: serves grants whose document lies outside the owner's worktree. */
export function registerHostFileDocPreviewRead(next: HostFileDocPreviewReader): void {
  reader = next
}

/** Renderer: reads what a terminal grant refuses to send in one reply. */
export function registerLargeHostFileReader(next: LargeHostFileReader): void {
  largeFileReader = next
}

/** Whether a paired host's preview plan and HTML links cover files outside the workspace. */
export function previewsHostFiles(): boolean {
  return renderer !== null
}

/** The grant for a document outside the clicked workspace; null keeps upstream's refusal. */
export function hostFileDocLocation(
  environmentId: string | null,
  worktreeId: string,
  worktreeRoot: string | null,
  filePath: string
): HostFileDocLocation | null {
  if (!renderer || !environmentId || !worktreeRoot) {
    return null
  }
  return renderer.location({ environmentId, worktreeId, worktreeRoot, filePath })
}

/** An image a document outside the workspace names; null keeps upstream's error. */
export function readHostDocumentResource(
  target: RuntimeClientTarget,
  worktreeId: string | null | undefined,
  filePath: string,
  access: LocalFileAccess | undefined
): Promise<RuntimeFilePreviewResult> | null {
  if (!renderer || access?.kind !== 'document-resource' || target.kind !== 'environment') {
    return null
  }
  return worktreeId ? renderer.readDocumentResource(target, worktreeId, filePath) : null
}

/** Main process, where upstream's reader gives up outside the worktree; null keeps its 404. */
export function readHostDocPreview(
  grantId: string,
  absolutePath: string,
  contentType: string
): Promise<HostFileDocPreviewOutcome> | null {
  return reader ? reader(grantId, absolutePath, contentType) : null
}

/**
 * Renderer, where a grant read refuses a file: text past 512 KiB, or a binary, whose image or PDF
 * preview may be past one reply. Null keeps upstream's handling of the refusal.
 */
export function readLargeHostFile(
  file: GrantedHostFile,
  refusal: unknown
): Promise<RuntimeFilePreviewResult> | null {
  return largeFileReader &&
    refusal instanceof Error &&
    (refusal.message === 'file_too_large' || refusal.message === 'binary_file')
    ? largeFileReader(file, refusal)
    : null
}
