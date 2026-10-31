// fork (F049): extra browsers in the cookie import hint. Unregistered, the hint is upstream's list.

export type ForkCookieImportSource = {
  label: string
  mac: boolean
  win: boolean
  linux: boolean
}

let extraSources: readonly ForkCookieImportSource[] = []

/** Whole-list replace, so the desktop, renderer and orcad registering again adds no duplicates. */
export function registerForkCookieImportSources(sources: readonly ForkCookieImportSource[]): void {
  extraSources = sources
}

export function forkCookieImportSourceLabels(
  platform: 'darwin' | 'win32' | 'linux',
  listed: readonly string[]
): string[] {
  const key = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux'
  return extraSources
    .filter((source) => source[key] && !listed.includes(source.label))
    .map((source) => source.label)
}
