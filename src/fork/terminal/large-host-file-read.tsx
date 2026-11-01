// F046: the editor opens a file outside every workspace that its terminal grant will not send in one
// reply: text past 512 KiB, past the reply once decoded, or a log that changed since its grant; an
// image or PDF past the grant preview's reply (about 3 MB). It pages the file by absolute path
// through upstream's loop, up to the size upstream opens inside a workspace. .tsx because it imports
// renderer aliases.
import { useAppStore } from '@/store'
import { decodeBase64Bytes } from '@/lib/base64-bytes'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { RuntimeFileSnapshot } from '@/runtime/runtime-file-range-client'
import {
  PAGED_REMOTE_FILE_MAX_BYTES,
  pagedFilePreviewResult,
  pagedTextFileResult,
  previewableBinaryMimeType,
  readFileInChunks,
  type ChunkedFileReader
} from '@/runtime/runtime-paged-file-read'
import { CSV_PAGED_PREVIEW_BYTES } from '@/components/editor/csv/csv-file-limits'
import { BINARY_PROBE_BYTES } from '../../shared/binary-buffer'
import type {
  RuntimeFilePreviewResult,
  RuntimeFileReadChunkResult
} from '../../shared/runtime-types'
import {
  HOST_FILE_READ_CHUNK_METHOD,
  HOST_FILE_STAT_METHOD,
  registerLargeHostFileReader,
  registerLargeHostPreviewReader,
  type GrantedHostFile,
  type LargeHostFileRefusal
} from '../../shared/fork-hooks/host-file-doc-preview'

/** A grant saves at most this much; a tab read past it is a view. */
const GRANT_WRITE_MAX_BYTES = 512 * 1024

type HostFileSnapshot = RuntimeFileSnapshot & { fileId?: string }
export type HostFile = Pick<
  GrantedHostFile,
  'target' | 'worktreeId' | 'absolutePath' | 'expectedEnvironmentPairingRevision'
>

function callHost<TResult>(
  file: HostFile,
  method: string,
  timeoutMs: number,
  range?: { offset: number; length: number }
): Promise<TResult> {
  return callRuntimeRpc<TResult>(
    file.target,
    method,
    { worktree: toRuntimeWorktreeSelector(file.worktreeId), path: file.absolutePath, ...range },
    { timeoutMs, expectedEnvironmentPairingRevision: file.expectedEnvironmentPairingRevision }
  )
}

export function statHostFile(file: HostFile): Promise<HostFileSnapshot> {
  return callHost(file, HOST_FILE_STAT_METHOD, 15_000)
}

export function readHostRange(
  file: HostFile,
  offset: number,
  length: number
): Promise<RuntimeFileReadChunkResult> {
  return length > 0
    ? callHost(file, HOST_FILE_READ_CHUNK_METHOD, 60_000, { offset, length })
    : Promise.resolve({ contentBase64: '', bytesRead: 0, eof: true })
}

/** Upstream's terms: a file that changes in any way while it loads is refused. */
function strictHostFileReader(file: HostFile): ChunkedFileReader {
  return {
    stat: () => statHostFile(file),
    readChunk: (offset, length) => readHostRange(file, offset, length)
  }
}

function unchanged(first: HostFileSnapshot, current: HostFileSnapshot): boolean {
  return (
    first.size === current.size && first.mtime === current.mtime && first.ctime === current.ctime
  )
}

type ReadRange = { offset: number; contentBase64: string; bytesRead: number }

/**
 * Text read as of the first stat. A file that only grew since (the same file, longer, its first and
 * last ranges read still holding the same bytes) passes the loop's final check, so a log being
 * written opens. Any other change, a same-size rewrite included, is refused as upstream refuses it.
 */
function snapshotHostFileReader(file: HostFile): ChunkedFileReader {
  let first: HostFileSnapshot | null = null
  const ranges: ReadRange[] = []
  const stillHolds = async (range: ReadRange): Promise<boolean> =>
    range.bytesRead === 0 ||
    (await readHostRange(file, range.offset, range.bytesRead)).contentBase64 === range.contentBase64
  const onlyGrew = async (before: HostFileSnapshot, after: HostFileSnapshot): Promise<boolean> => {
    // Why: appending always lengthens a file; the same size with a new mtime is a rewrite.
    if (after.size <= before.size || (before.fileId && after.fileId !== before.fileId)) {
      return false
    }
    const edges = new Set([ranges[0], ranges.at(-1)])
    for (const range of edges) {
      if (!range) {
        continue
      }
      if (!(await stillHolds(range))) {
        return false
      }
    }
    return true
  }
  return {
    stat: async () => {
      const current = await statHostFile(file)
      if (!first) {
        first = current
        return current
      }
      return !unchanged(first, current) && (await onlyGrew(first, current)) ? first : current
    },
    readChunk: async (offset, length) => {
      const size = first?.size ?? 0
      const chunk = await readHostRange(file, offset, Math.min(length, Math.max(0, size - offset)))
      ranges.push({ offset, contentBase64: chunk.contentBase64, bytesRead: chunk.bytesRead })
      return offset + chunk.bytesRead >= size ? { ...chunk, eof: true } : chunk
    }
  }
}

export function isMissingMethod(error: unknown): boolean {
  return error instanceof RuntimeRpcCallError && error.code === 'method_not_found'
}

function tooLargeError(size: number): Error {
  return new Error(`Remote file is too large to open in the editor (${size} bytes)`)
}

/** What upstream would have thrown, for a host without files.hostFile.*. */
function upstreamRefusal(refusal: LargeHostFileRefusal): Error {
  return refusal instanceof Error ? refusal : tooLargeError(refusal.byteLength)
}

/** No save of this size can reach the host, so the tab says so instead of failing at save time. */
function keepReadOnly(file: HostFile): void {
  const { openFiles } = useAppStore.getState()
  const matches = (open: (typeof openFiles)[number]): boolean =>
    open.worktreeId === file.worktreeId && open.filePath === file.absolutePath && !open.readOnly
  if (openFiles.some(matches)) {
    useAppStore.setState({
      openFiles: openFiles.map((open) => (matches(open) ? { ...open, readOnly: true } : open))
    })
  }
}

async function readLargeHostFile(
  file: GrantedHostFile,
  refusal: LargeHostFileRefusal
): Promise<RuntimeFilePreviewResult> {
  let probe: RuntimeFileReadChunkResult
  try {
    probe = await readHostRange(file, 0, BINARY_PROBE_BYTES)
  } catch (error) {
    throw isMissingMethod(error) ? upstreamRefusal(refusal) : error
  }
  // A binary without an image or PDF extension: say so without paging megabytes first.
  if (decodeBase64Bytes(probe.contentBase64).includes(0)) {
    return { content: '', isBinary: true }
  }
  // Why: past upstream's paging threshold a host CSV opens in the paged preview (host-file-csv-preview);
  // a whole read reaching here is a tab with a draft, which upstream also refuses as a table.
  const maxBytes = /\.(csv|tsv)$/i.test(file.absolutePath)
    ? CSV_PAGED_PREVIEW_BYTES
    : PAGED_REMOTE_FILE_MAX_BYTES
  const paged = await readFileInChunks(snapshotHostFileReader(file), { maxBytes })
  if (paged.kind === 'unsupported') {
    throw upstreamRefusal(refusal)
  }
  if (paged.kind === 'too_large') {
    throw tooLargeError(paged.size)
  }
  if (paged.bytes.length > GRANT_WRITE_MAX_BYTES) {
    keepReadOnly(file)
  }
  return pagedTextFileResult(paged.bytes)
}

/** An image or PDF past the grant preview's one reply: the editor's, a chat's or a Markdown file's. */
async function readLargeHostPreview(
  file: HostFile,
  refusal: unknown
): Promise<RuntimeFilePreviewResult> {
  const tooLarge = refusal instanceof RuntimeRpcCallError && refusal.message === 'file_too_large'
  // Why: the preview sends no other binary's bytes, so paging one would only fetch megabytes to drop.
  if (!tooLarge || !previewableBinaryMimeType(file.absolutePath)) {
    throw refusal
  }
  const paged = await readFileInChunks(strictHostFileReader(file))
  if (paged.kind !== 'ok') {
    throw refusal
  }
  return pagedFilePreviewResult(file.absolutePath, paged.bytes)
}

export function registerLargeHostFileReads(): void {
  registerLargeHostFileReader(readLargeHostFile)
  registerLargeHostPreviewReader(readLargeHostPreview)
}
