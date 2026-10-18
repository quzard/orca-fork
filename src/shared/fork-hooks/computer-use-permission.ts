// fork: extra arguments for the macOS permission helper. Unregistered, the helper gets upstream's.

let helperArgs: readonly string[] = []

export function registerComputerUsePermissionHelperArgs(args: readonly string[]): void {
  helperArgs = args
}

export function computerUsePermissionHelperArgs(): readonly string[] {
  return helperArgs
}
