// F046: a CSV or TSV outside every workspace past upstream's paging threshold opens in upstream's paged
// preview, as one inside a workspace does: the preview stats it and reads its ranges by absolute path
// through files.hostFile.*. A host without those keeps the whole read through the grant. .tsx because
// it imports renderer aliases.
import { decodeBase64Bytes } from '@/lib/base64-bytes'
import { isHostFileOutsideWorkspaces } from '@/runtime/runtime-terminal-artifact-read'
import { CSV_PAGED_PREVIEW_BYTES } from '@/components/editor/csv/csv-file-limits'
import {
  registerHostFileRanges,
  type HostFileReadArgs,
  type HostFileSnapshot
} from '../../shared/fork-hooks/host-file-ranges'
import { isMissingMethod, readHostRange, statHostFile, type HostFile } from './large-host-file-read'

function hostFile(args: HostFileReadArgs): HostFile | null {
  const { target, worktreeId, filePath } = args
  const outside = isHostFileOutsideWorkspaces({
    filePath,
    relativePath: args.relativePath,
    grantId: args.terminalArtifactGrantId
  })
  return target.kind === 'environment' && worktreeId && outside
    ? {
        target,
        worktreeId,
        absolutePath: filePath,
        expectedEnvironmentPairingRevision: args.expectedEnvironmentPairingRevision
      }
    : null
}

async function pagedCsvSnapshot(args: HostFileReadArgs): Promise<HostFileSnapshot | null> {
  const file = /\.(csv|tsv)$/i.test(args.filePath) ? hostFile(args) : null
  if (!file) {
    return null
  }
  try {
    const snapshot = await statHostFile(file)
    return !snapshot.isDirectory && snapshot.size >= CSV_PAGED_PREVIEW_BYTES ? snapshot : null
  } catch (error) {
    // Why: an older host cannot stat by path; its grant still sends a CSV up to the reply cap.
    if (isMissingMethod(error)) {
      return null
    }
    throw error
  }
}

async function readRange(
  file: HostFile,
  offset: number,
  length: number
): Promise<Uint8Array<ArrayBuffer>> {
  const result = await readHostRange(file, offset, length)
  const bytes = decodeBase64Bytes(result.contentBase64)
  // Upstream's check on a files.readChunk range: a short or empty one means the file changed.
  if (bytes.length !== result.bytesRead || bytes.length > length || bytes.length === 0) {
    throw new Error('File changed or returned an invalid CSV chunk. Reload the preview.')
  }
  return bytes
}

export function registerHostCsvPreviews(): void {
  registerHostFileRanges({
    pagedCsvSnapshot,
    stat: (args) => {
      const file = hostFile(args)
      return file ? statHostFile(file) : null
    },
    read: (args, offset, length) => {
      const file = hostFile(args)
      return file ? readRange(file, offset, length) : null
    }
  })
}
