// fork: F046. A paired host's file that another workspace holds opens read-only in the clicked
// workspace through a host grant, instead of switching. Unregistered, links keep upstream.
import type { RuntimeClientTarget } from '../runtime-client-target'
import type { RuntimeTerminalPathResolution } from '../runtime-file-contracts'

/** Same shape as the renderer's granted host file, so callers treat it like any other grant. */
export type KeptHostFile = {
  kind: 'grant'
  absolutePath: string
  grantId: string
  isDirectory: false
  readOnly: boolean
}

export type KeptHostFileSource = {
  target: RuntimeClientTarget
  worktreeId: string | null | undefined
}

export type KeptHostFileTab = {
  filePath: string
  relativePath: string
  readOnly?: boolean
  runtimeEnvironmentId?: string | null
}

type KeptHostFileViews = {
  keep: (
    source: KeptHostFileSource,
    resolved: RuntimeTerminalPathResolution
  ) => Promise<KeptHostFile | null>
  isKeptView: (file: KeptHostFileTab) => boolean
}

let views: KeptHostFileViews | null = null

export function registerKeptHostFileViews(next: KeptHostFileViews): void {
  views = next
}

/** The host named another workspace; a grant keeps the file in the clicked one. */
export function keepHostFileInClickedWorkspace(
  source: KeptHostFileSource,
  resolved: RuntimeTerminalPathResolution
): Promise<KeptHostFile | null> {
  return views ? views.keep(source, resolved) : Promise.resolve(null)
}

/** A kept view must not be re-owned into the workspace that holds its path. */
export function isKeptHostFileView(file: KeptHostFileTab | undefined): boolean {
  return Boolean(views && file && views.isKeptView(file))
}
