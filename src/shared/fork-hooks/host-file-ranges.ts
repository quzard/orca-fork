// fork: F046. A CSV or TSV outside every workspace past upstream's paging threshold opens in upstream's
// paged preview; the preview's stat and range reads go to the host by absolute path. Unregistered, a
// granted host file keeps upstream's whole read through its grant.
import type { RuntimeClientTarget } from '../runtime-client-target'

/** The fields of the renderer's file read args that name a host file. */
export type HostFileReadArgs = {
  target: RuntimeClientTarget
  filePath: string
  relativePath?: string
  worktreeId?: string
  terminalArtifactGrantId?: string
  expectedEnvironmentPairingRevision?: number
}

export type HostFileSnapshot = { size: number; isDirectory: boolean; mtime: number; ctime?: number }

type HostFileRanges = {
  /** The host CSV's stat when the paged preview should open it; null reads it whole. */
  pagedCsvSnapshot: (args: HostFileReadArgs) => Promise<HostFileSnapshot | null>
  /** Null when the args name no host file outside every workspace. */
  stat: (args: HostFileReadArgs) => Promise<HostFileSnapshot> | null
  read: (
    args: HostFileReadArgs,
    offset: number,
    length: number
  ) => Promise<Uint8Array<ArrayBuffer>> | null
}

let ranges: HostFileRanges | null = null

/** Renderer: the paged CSV preview's reads for host files outside every workspace. */
export function registerHostFileRanges(next: HostFileRanges): void {
  ranges = next
}

/** Where upstream reads a granted host CSV whole; null keeps that read. */
export async function pagedHostCsvPreview<TArgs extends HostFileReadArgs>(
  args: TArgs,
  allowPagedPreview: boolean
): Promise<{
  content: string
  isBinary: false
  csvPreview: { readArgs: TArgs; snapshot: HostFileSnapshot }
} | null> {
  const snapshot = ranges && allowPagedPreview ? await ranges.pagedCsvSnapshot(args) : null
  return snapshot
    ? { content: '', isBinary: false, csvPreview: { readArgs: args, snapshot } }
    : null
}

/** The paged preview's stat; null keeps upstream's route, which has none for a host file. */
export function statHostFileRange(args: HostFileReadArgs): Promise<HostFileSnapshot> | null {
  return ranges ? ranges.stat(args) : null
}

/** The paged preview's range read; null keeps upstream's route. */
export function readHostFileRange(
  args: HostFileReadArgs,
  offset: number,
  length: number
): Promise<Uint8Array<ArrayBuffer>> | null {
  return ranges ? ranges.read(args, offset, length) : null
}
