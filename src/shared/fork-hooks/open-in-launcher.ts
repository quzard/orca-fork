// fork: 「打开于」额外启动器。空表不增加菜单项。

export type OpenInLauncherContext = {
  worktreePath: string
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
}

export type OpenInLauncher = {
  id: string
  label: string
  command?: string
  target?: 'external-editor' | 'file-manager'
  canOpen?: (context: OpenInLauncherContext) => boolean
  open?: (context: OpenInLauncherContext) => void | Promise<void>
  /** Hide this row when the user already configured one of these commands. */
  hiddenBesideCommands?: (commands: readonly string[]) => boolean
}

const launchers = new Map<string, OpenInLauncher>()

export function registerOpenInLauncher(launcher: OpenInLauncher): void {
  launchers.set(launcher.id, launcher)
}

export function listOpenInLaunchers(): readonly OpenInLauncher[] {
  return [...launchers.values()]
}

export function openInLauncherEntryId(id: string): string {
  return `fork:${id}`
}

export function findOpenInLauncher(entryId: string): OpenInLauncher | undefined {
  if (!entryId.startsWith('fork:')) {
    return undefined
  }
  return launchers.get(entryId.slice('fork:'.length))
}

export type OpenInRouteContext = OpenInLauncherContext & {
  command?: string
  ownerUnresolved?: boolean
  target: 'external-editor' | 'file-manager'
}

export type OpenInRouteAdjustment = {
  disabled: boolean
  metadata?: string
  connectionId: string
}

type OpenInRouteAdjuster = (context: OpenInRouteContext) => OpenInRouteAdjustment | null

let routeAdjuster: OpenInRouteAdjuster | undefined

export function registerOpenInRouteAdjuster(next: OpenInRouteAdjuster): void {
  routeAdjuster = next
}

export function adjustOpenInRoute(context: OpenInRouteContext): OpenInRouteAdjustment | null {
  return routeAdjuster?.(context) ?? null
}
