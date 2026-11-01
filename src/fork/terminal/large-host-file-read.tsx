// F046: the editor opens a host file outside every workspace past a terminal grant's one reply
// (512 KiB of text, about 3 MB of image or PDF) by reading it in ranges by absolute path, up to the
// 50 MiB upstream opens inside a workspace. Saving past 512 KiB stays refused, as upstream does.
// .tsx because it imports renderer aliases.
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { RuntimeFileSnapshot } from '@/runtime/runtime-file-range-client'
import {
  PAGED_REMOTE_FILE_MAX_BYTES,
  REMOTE_FILE_CHANGED_DURING_READ_MESSAGE,
  pagedFilePreviewResult,
  pagedTextFileResult,
  previewableBinaryMimeType
} from '@/runtime/runtime-paged-file-read'
import type {
  RuntimeFilePreviewResult,
  RuntimeFileReadChunkResult
} from '../../shared/runtime-types'
import {
  HOST_FILE_READ_CHUNK_METHOD,
  HOST_FILE_STAT_METHOD,
  registerLargeHostFileReader,
  type GrantedHostFile
} from '../../shared/fork-hooks/host-file-doc-preview'

// Why: under the chunk method's 512 KiB cap, and a multiple of 3 so its base64 has no padding.
const CHUNK_BYTES = 384 * 1024

function callHost<TResult>(
  file: GrantedHostFile,
  method: string,
  params: object,
  timeoutMs: number
): Promise<TResult> {
  return callRuntimeRpc<TResult>(file.target, method, params, {
    timeoutMs,
    expectedEnvironmentPairingRevision: file.expectedEnvironmentPairingRevision
  })
}

function statHostFile(file: GrantedHostFile): Promise<RuntimeFileSnapshot> {
  return callHost(
    file,
    HOST_FILE_STAT_METHOD,
    { worktree: toRuntimeWorktreeSelector(file.worktreeId), path: file.absolutePath },
    15_000
  )
}

function decodeBase64(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** The file's bytes as of the first stat; null when the host predates files.hostFile.*. */
async function readHostFileBytes(file: GrantedHostFile): Promise<Uint8Array | null> {
  let before: RuntimeFileSnapshot
  try {
    before = await statHostFile(file)
  } catch (error) {
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      return null
    }
    throw error
  }
  if (before.isDirectory) {
    throw new Error('Remote path is a directory')
  }
  if (before.size > PAGED_REMOTE_FILE_MAX_BYTES) {
    throw new Error(`Remote file is too large to open in the editor (${before.size} bytes)`)
  }
  const bytes = new Uint8Array(before.size)
  let offset = 0
  while (offset < before.size) {
    const chunk = await callHost<RuntimeFileReadChunkResult>(
      file,
      HOST_FILE_READ_CHUNK_METHOD,
      {
        worktree: toRuntimeWorktreeSelector(file.worktreeId),
        path: file.absolutePath,
        offset,
        length: Math.min(CHUNK_BYTES, before.size - offset)
      },
      60_000
    )
    const decoded = decodeBase64(chunk.contentBase64)
    if (decoded.length === 0) {
      throw new Error(REMOTE_FILE_CHANGED_DURING_READ_MESSAGE)
    }
    bytes.set(decoded, offset)
    offset += decoded.length
  }
  // Why: a log grows while it loads and the bytes read are still the file as it was; a shrink is a rewrite.
  if ((await statHostFile(file)).size < before.size) {
    throw new Error(REMOTE_FILE_CHANGED_DURING_READ_MESSAGE)
  }
  return bytes
}

function isTooLarge(error: unknown): boolean {
  return error instanceof RuntimeRpcCallError && error.message === 'file_too_large'
}

async function readLargeHostFile(
  file: GrantedHostFile,
  refusal: Error
): Promise<RuntimeFilePreviewResult> {
  if (refusal.message !== 'binary_file') {
    const bytes = await readHostFileBytes(file)
    if (!bytes) {
      throw refusal
    }
    return pagedTextFileResult(bytes)
  }
  // Upstream's binary branch: images and PDFs preview through the grant in one reply.
  try {
    return await callHost<RuntimeFilePreviewResult>(
      file,
      'files.readTerminalArtifactPreview',
      {
        worktree: toRuntimeWorktreeSelector(file.worktreeId),
        grantId: file.grantId,
        absolutePath: file.absolutePath
      },
      15_000
    )
  } catch (error) {
    if (!isTooLarge(error) || !previewableBinaryMimeType(file.absolutePath)) {
      throw error
    }
    const bytes = await readHostFileBytes(file)
    if (!bytes) {
      throw error
    }
    return pagedFilePreviewResult(file.absolutePath, bytes)
  }
}

export function registerLargeHostFileReads(): void {
  registerLargeHostFileReader(readLargeHostFile)
}
