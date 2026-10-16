export type ForkRemoteEditorUrlSpec = {
  kind: 'url'
  url: string
}

type ForkRemoteEditorLaunch = (
  command: string,
  pathValue: string,
  authority: string
) => ForkRemoteEditorUrlSpec | null

let remoteEditorLaunch: ForkRemoteEditorLaunch | undefined

export function registerForkRemoteEditorLaunch(next: ForkRemoteEditorLaunch): void {
  remoteEditorLaunch = next
}

export function resolveForkRemoteEditorLaunch(
  command: string,
  pathValue: string,
  authority: string
): ForkRemoteEditorUrlSpec | null {
  return remoteEditorLaunch?.(command, pathValue, authority) ?? null
}
