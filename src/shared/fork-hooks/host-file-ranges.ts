// fork: F046. A CSV or TSV outside every workspace past upstream's paging threshold opens in upstream's
// paged preview; the preview's stat and range reads go to the host by absolute path. Unregistered, a
// host file keeps upstream's reads.
import type { RuntimeClientTarget } from '../runtime-client-target'

/** The fields of the renderer's file read args that name a host file. */
export type HostFileReadArgs = {
  target: RuntimeClientTarget
  filePath: string
  relativePath?: string
  worktreeId?: string
  terminalArtifactGrantId?: string
  expectedEnvironmentPairingRevision?: number
  /** Set on a tab of a direct SSH connection, which these reads never serve. */
  expectedExternalSshTargetId?: string
}

export type HostFileSnapshot = { size: number; isDirectory: boolean; mtime: number; ctime?: number }

/** The editor content of a CSV for upstream's paged preview. */
export type HostCsvPreview<TArgs> = {
  content: string
  isBinary: false
  csvPreview: { readArgs: TArgs; snapshot: HostFileSnapshot }
}

type HostFileRanges = {
  /** A host CSV past the paging threshold as a paged preview, else `readWhole`; null for any other file. */
  readCsv: <TArgs extends HostFileReadArgs, TContent>(
    args: TArgs,
    readWhole: () => Promise<TContent>
  ) => Promise<TContent | HostCsvPreview<TArgs>> | null
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

/** Before upstream's CSV branch, which has no route for a host file; null keeps that branch. */
export function readHostCsv<TArgs extends HostFileReadArgs, TContent>(
  args: TArgs,
  allowPagedPreview: boolean,
  readWhole: () => Promise<TContent>
): Promise<TContent | HostCsvPreview<TArgs>> | null {
  return ranges && allowPagedPreview ? ranges.readCsv(args, readWhole) : null
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
