// F046: a doc preview whose document lies outside its runtime worktree, read file by file through
// host grants: files.resolveTerminalPath mints each, files.readTerminalArtifactPreview reads it.
import type { HostFileDocPreviewOutcome } from '../../shared/fork-hooks/host-file-doc-preview'
import { callRuntimeEnvironment } from '../../main/ipc/runtime-environments/runtime-environment-transport-routing'
import { getRuntimeEnvironmentRegistryRoot } from '../../main/ipc/runtime-environments/runtime-environment-registry-root'
import {
  getDocPreviewGrant,
  resolveCanonicalDocPreviewPath,
  resolveDocPreviewAuthorityPaths,
  toRuntimeWorktreeRelativePath
} from '../../main/browser/doc-preview-grant-registry'

const READ_TIMEOUT_MS = 15_000

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

type HostOwner = { environmentId: string; worktreeSelector: string }

async function callHost(owner: HostOwner, method: string, params: object): Promise<unknown> {
  const response = await callRuntimeEnvironment(
    getRuntimeEnvironmentRegistryRoot(),
    owner.environmentId,
    method,
    { worktree: owner.worktreeSelector, ...params },
    READ_TIMEOUT_MS
  )
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  return response.result
}

/** The host's canonical spelling of a path it has, files and folders alike. */
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

/** Called only where upstream's reader gives up; a document inside the worktree stays its 404. */
export async function readGrantedHostDocPreview(
  grantId: string,
  absolutePath: string,
  contentType: string
): Promise<HostFileDocPreviewOutcome> {
  const grant = getDocPreviewGrant(grantId)
  if (!grant || grant.owner.kind !== 'runtime') {
    return notFound()
  }
  const owner = grant.owner
  const entry = resolveDocPreviewAuthorityPaths(grant).entryPath
  if (!entry || toRuntimeWorktreeRelativePath(owner.worktreeRoot, entry) !== null) {
    return notFound()
  }
  const resolutions = new Map<string, Promise<unknown>>()
  const resolve = (path: string): Promise<unknown> => {
    let pending = resolutions.get(path)
    if (!pending) {
      pending = callHost(owner, 'files.resolveTerminalPath', { pathText: path })
      resolutions.set(path, pending)
    }
    return pending
  }
  try {
    // Why canonical on the host: a symlink beside the document must not reach past its folder.
    const canonical = await resolveCanonicalDocPreviewPath(grant, absolutePath, async (path) => {
      const hostPath = hostCanonicalPath(await resolve(path))
      if (!hostPath) {
        throw new Error('Not found')
      }
      return hostPath
    })
    const granted = canonical ? hostGrant(await resolve(absolutePath)) : null
    if (!granted) {
      return notFound()
    }
    return toOutcome(
      await callHost(owner, 'files.readTerminalArtifactPreview', granted),
      contentType
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined
    if (message === 'file_too_large') {
      return TOO_LARGE
    }
    return message === 'binary_file' ? UNSUPPORTED : notFound(message)
  }
}
