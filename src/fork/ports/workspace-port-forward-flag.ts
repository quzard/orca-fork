let portForwardEnabled = false

export function enableWorkspacePortForward(): void {
  portForwardEnabled = true
}

export function workspacePortForwardEnabled(): boolean {
  return portForwardEnabled
}
