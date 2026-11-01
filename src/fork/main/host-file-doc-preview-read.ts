// F046: a doc preview whose document lies outside its runtime worktree. Its grant is rooted at the
// host's filesystem root, so the page resolves paths as it would from file:// (F051 lets it read
// them all). The host reads each file by absolute path (files.hostDocPreview.*, ranged past one
// reply); a host without those methods serves it through terminal grants.
import { posix, win32 } from 'node:path'
import { isBinaryBuffer } from '../../shared/binary-buffer'
import { isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'
import {
  DOC_PREVIEW_FILE_CHANGED_MESSAGE,
  type DocPreviewFileChunk
} from '../../shared/doc-preview-file-access'
import {
  HOST_DOC_PREVIEW_READ_CHUNK_METHOD,
  HOST_DOC_PREVIEW_READ_METHOD,
  type HostFileDocPreviewOutcome
} from '../../shared/fork-hooks/host-file-doc-preview'
import { callRuntimeEnvironment } from '../../main/ipc/runtime-environments/runtime-environment-transport-routing'
import { getRuntimeEnvironmentRegistryRoot } from '../../main/ipc/runtime-environments/runtime-environment-registry-root'
import {
  getDocPreviewGrant,
  resolveCanonicalDocPreviewPath,
  resolveDocPreviewAuthorityPaths,
  toRuntimeWorktreeRelativePath,
  type DocPreviewGrant
} from '../../main/browser/doc-preview-grant-registry'
import type { HostDocPreviewReadParams } from './host-file-methods'

const READ_TIMEOUT_MS = 15_000
// Why: under the chunk method's 512 KiB cap, and a multiple of 3 so its base64 has no padding.
const CHUNK_BYTES = 384 * 1024
const TOO_LARGE_ERROR = 'file_too_large'

const TOO_LARGE: HostFileDocPreviewOutcome = {
  ok: false,
  status: 413,
  reason: 'too-large',
  message: 'This document is too large for the server to send in full.'
}

const UNSUPPORTED: HostFileDocPreviewOutcome = {
  ok: false,
  status: 415,
  reason: 'unsupported-asset',
  message: 'This workspace cannot send this file type to a preview.'
}

function notFound(message = 'Not found'): HostFileDocPreviewOutcome {
  return { ok: false, status: 404, reason: 'unreadable', message }
}

type HostOwner = Extract<DocPreviewGrant['owner'], { kind: 'runtime' }>
type OutsideDocument = { grant: DocPreviewGrant; owner: HostOwner; entryPath: string }

class HostCallError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

async function callHost(owner: HostOwner, method: string, params: object): Promise<unknown> {
  const response = await callRuntimeEnvironment(
    getRuntimeEnvironmentRegistryRoot(),
    owner.environmentId,
    method,
    { worktree: owner.worktreeSelector, ...params },
    READ_TIMEOUT_MS
  )
  if (!response.ok) {
    throw new HostCallError(response.error.code, response.error.message)
  }
  return response.result
}

function isMissingMethod(error: unknown): boolean {
  return error instanceof HostCallError && error.code === 'method_not_found'
}

function isTooLarge(error: unknown): boolean {
  return error instanceof Error && error.message === TOO_LARGE_ERROR
}

/** A grant minted for a document outside its runtime worktree, else null. */
function outsideWorkspaceDocument(grant: DocPreviewGrant | null): OutsideDocument | null {
  if (!grant || grant.owner.kind !== 'runtime') {
    return null
  }
  const entryPath = resolveDocPreviewAuthorityPaths(grant).entryPath
  return entryPath && toRuntimeWorktreeRelativePath(grant.owner.worktreeRoot, entryPath) === null
    ? { grant, owner: grant.owner, entryPath }
    : null
}

function toOutcome(preview: unknown, contentType: string): HostFileDocPreviewOutcome {
  if (typeof preview !== 'object' || preview === null) {
    return notFound()
  }
  const fields: Partial<Record<'content' | 'isBinary' | 'mimeType', unknown>> = preview
  if (typeof fields.content !== 'string' || typeof fields.isBinary !== 'boolean') {
    return notFound()
  }
  if (!fields.isBinary) {
    return { ok: true, bytes: Buffer.from(fields.content, 'utf8'), contentType }
  }
  if (fields.content) {
    return { ok: true, bytes: Buffer.from(fields.content, 'base64'), contentType }
  }
  // Same rule as upstream's reader: an empty binary without a type is an unsupported format.
  return typeof fields.mimeType === 'string'
    ? { ok: true, bytes: Buffer.alloc(0), contentType }
    : UNSUPPORTED
}

function isDocPreviewFileChunk(value: unknown): value is DocPreviewFileChunk {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const chunk: Partial<Record<keyof DocPreviewFileChunk, unknown>> = value
  return (
    typeof chunk.contentBase64 === 'string' &&
    typeof chunk.size === 'number' &&
    typeof chunk.mtimeMs === 'number' &&
    typeof chunk.ctimeMs === 'number' &&
    (chunk.mimeType === undefined || typeof chunk.mimeType === 'string')
  )
}

/** As upstream's ranged doc-preview read: every chunk must report the version the first one opened. */
async function readInChunks(
  document: OutsideDocument,
  params: Omit<HostDocPreviewReadParams, 'worktree'>
): Promise<{ bytes: Buffer; mimeType?: string }> {
  const chunks: Buffer[] = []
  let first: DocPreviewFileChunk | null = null
  let offset = 0
  do {
    // Why: a closed preview revokes its grant; stop paging a file nobody will see.
    if (!getDocPreviewGrant(document.grant.id)) {
      throw new Error('Not found')
    }
    let chunk: unknown
    try {
      chunk = await callHost(document.owner, HOST_DOC_PREVIEW_READ_CHUNK_METHOD, {
        ...params,
        offset,
        length: CHUNK_BYTES
      })
    } catch (error) {
      throw isMissingMethod(error) ? new Error(TOO_LARGE_ERROR) : error
    }
    if (!isDocPreviewFileChunk(chunk)) {
      throw new Error('The paired machine returned an unreadable file chunk.')
    }
    first ??= chunk
    const bytes = Buffer.from(chunk.contentBase64, 'base64')
    if (
      bytes.length === 0 ||
      offset + bytes.length > first.size ||
      chunk.size !== first.size ||
      chunk.mtimeMs !== first.mtimeMs ||
      chunk.ctimeMs !== first.ctimeMs
    ) {
      throw new Error(DOC_PREVIEW_FILE_CHANGED_MESSAGE)
    }
    chunks.push(bytes)
    offset += bytes.length
  } while (offset < first.size)
  return { bytes: Buffer.concat(chunks), mimeType: first.mimeType }
}

/** Null when the host predates files.hostDocPreview.*. */
async function readByHostPath(
  document: OutsideDocument,
  absolutePath: string,
  contentType: string
): Promise<HostFileDocPreviewOutcome | null> {
  const authority = resolveDocPreviewAuthorityPaths(document.grant)
  const params = {
    boundaryPath: document.grant.requestBase,
    entryPath: document.entryPath,
    implicitRootPath: authority.implicitRootPath,
    authorizedRootPaths: authority.authorizedRootPaths,
    targetPath: absolutePath
  }
  try {
    return toOutcome(
      await callHost(document.owner, HOST_DOC_PREVIEW_READ_METHOD, params),
      contentType
    )
  } catch (error) {
    if (isMissingMethod(error)) {
      return null
    }
    if (!isTooLarge(error)) {
      throw error
    }
  }
  const paged = await readInChunks(document, params)
  // The sniff the host applies to a whole text read.
  return !paged.mimeType && isBinaryBuffer(paged.bytes)
    ? UNSUPPORTED
    : { ok: true, bytes: paged.bytes, contentType }
}

function hostCanonicalPath(resolution: unknown): string | null {
  if (typeof resolution !== 'object' || resolution === null) {
    return null
  }
  const fields: Partial<Record<'exists' | 'absolutePath', unknown>> = resolution
  return fields.exists === true && typeof fields.absolutePath === 'string'
    ? fields.absolutePath
    : null
}

function hostGrant(resolution: unknown): { absolutePath: string; grantId: string } | null {
  if (typeof resolution !== 'object' || resolution === null) {
    return null
  }
  const { openTarget }: Partial<Record<'openTarget', unknown>> = resolution
  if (typeof openTarget !== 'object' || openTarget === null) {
    return null
  }
  const target: Partial<Record<'kind' | 'absolutePath' | 'grantId', unknown>> = openTarget
  return target.kind === 'absolute-file' &&
    typeof target.absolutePath === 'string' &&
    typeof target.grantId === 'string'
    ? { absolutePath: target.absolutePath, grantId: target.grantId }
    : null
}

/** Hosts before files.hostDocPreview.*: one terminal grant per file, 512 KiB of text, no fonts. */
async function readThroughTerminalGrants(
  document: OutsideDocument,
  absolutePath: string,
  contentType: string
): Promise<HostFileDocPreviewOutcome> {
  const resolutions = new Map<string, Promise<unknown>>()
  const resolve = (path: string): Promise<unknown> => {
    let pending = resolutions.get(path)
    if (!pending) {
      pending = callHost(document.owner, 'files.resolveTerminalPath', { pathText: path })
      resolutions.set(path, pending)
    }
    return pending
  }
  const canonical = await resolveCanonicalDocPreviewPath(
    document.grant,
    absolutePath,
    async (path) => {
      const hostPath = hostCanonicalPath(await resolve(path))
      if (!hostPath) {
        throw new Error('Not found')
      }
      return hostPath
    }
  )
  const granted = canonical ? hostGrant(await resolve(absolutePath)) : null
  if (!granted) {
    return notFound()
  }
  return toOutcome(
    await callHost(document.owner, 'files.readTerminalArtifactPreview', granted),
    contentType
  )
}

async function readOutsideFile(
  document: OutsideDocument,
  absolutePath: string,
  contentType: string
): Promise<HostFileDocPreviewOutcome> {
  try {
    return (
      (await readByHostPath(document, absolutePath, contentType)) ??
      (await readThroughTerminalGrants(document, absolutePath, contentType))
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined
    if (message === TOO_LARGE_ERROR) {
      return TOO_LARGE
    }
    return message === 'binary_file' ? UNSUPPORTED : notFound(message)
  }
}

/**
 * Where a root-absolute URL (`/assets/app.js`) lands when the filesystem root lacks it: under the
 * document's folder, as when that folder is served (a built single-page app). Null for a path
 * already in that folder.
 */
function siteRootPath(grant: DocPreviewGrant, absolutePath: string): string | null {
  const flavor = isWindowsAbsolutePathLike(grant.root) ? win32 : posix
  const fromFolder = flavor.relative(grant.root, absolutePath)
  const outside =
    fromFolder === '..' || fromFolder.startsWith(`..${flavor.sep}`) || flavor.isAbsolute(fromFolder)
  if (!outside) {
    return null
  }
  return flavor.join(grant.root, flavor.relative(grant.requestBase, absolutePath))
}

/** Called only where upstream's reader gives up; a document inside the worktree stays its 404. */
export async function readGrantedHostDocPreview(
  grantId: string,
  absolutePath: string,
  contentType: string
): Promise<HostFileDocPreviewOutcome> {
  const document = outsideWorkspaceDocument(getDocPreviewGrant(grantId))
  if (!document) {
    return notFound()
  }
  const outcome = await readOutsideFile(document, absolutePath, contentType)
  const fallback =
    outcome.ok || outcome.status !== 404 ? null : siteRootPath(document.grant, absolutePath)
  return fallback ? readOutsideFile(document, fallback, contentType) : outcome
}
