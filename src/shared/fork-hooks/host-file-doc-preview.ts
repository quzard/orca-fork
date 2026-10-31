// fork: F046. A paired host's document outside the clicked workspace renders in the doc preview,
// read through the host's per-file grants (upstream #33958). Unregistered, previews stay upstream.
import type { DocPreviewFileFailureReason } from '../doc-preview-scheme'
import type { LocalFileAccess } from '../local-file-access'
import type { RuntimeClientTarget } from '../runtime-client-target'
import type { RuntimeFilePreviewResult } from '../runtime-file-contracts'

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
    root: string
    entryRelativePath: string
  }) => HostFileDocLocation
  readDocumentResource: (
    target: RuntimeClientTarget & { kind: 'environment' },
    worktreeId: string,
    filePath: string
  ) => Promise<RuntimeFilePreviewResult>
  folder: (location: HostFileDocPreviewGrantLocation) => string | null
}

/** A minted grant's location as the renderer keeps it; SSH owners name no worktree root. */
export type HostFileDocPreviewGrantLocation = {
  owner: { kind: string; worktreeRoot?: string }
  requestBase: string
}

export type HostFileDocPreviewOutcome =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; status: number; reason: DocPreviewFileFailureReason; message: string }

type HostFileDocPreviewReader = (
  grantId: string,
  absolutePath: string,
  contentType: string
) => Promise<HostFileDocPreviewOutcome>

let renderer: HostFileDocPreviewRenderer | null = null
let reader: HostFileDocPreviewReader | null = null

export function registerHostFileDocPreview(next: HostFileDocPreviewRenderer): void {
  renderer = next
}

/** Main process: serves grants whose document lies outside the owner's worktree. */
export function registerHostFileDocPreviewRead(next: HostFileDocPreviewReader): void {
  reader = next
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
  root: string,
  entryRelativePath: string
): HostFileDocLocation | null {
  if (!renderer || !environmentId || !worktreeRoot) {
    return null
  }
  return renderer.location({ environmentId, worktreeId, worktreeRoot, root, entryRelativePath })
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

/** The folder a directory request means; null keeps upstream's worktree-root label. */
export function hostFileDocFolder(
  location: HostFileDocPreviewGrantLocation | null | undefined
): string | null {
  return renderer && location ? renderer.folder(location) : null
}

/** Main process, where upstream's reader gives up outside the worktree; null keeps its 404. */
export function readHostDocPreview(
  grantId: string,
  absolutePath: string,
  contentType: string
): Promise<HostFileDocPreviewOutcome> | null {
  return reader ? reader(grantId, absolutePath, contentType) : null
}
