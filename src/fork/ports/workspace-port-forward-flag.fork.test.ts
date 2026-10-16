import { describe, expect, it } from 'vitest'
import {
  enableWorkspacePortForward,
  workspacePortForwardEnabled
} from './workspace-port-forward-flag'

const enabledBeforeRegistration = workspacePortForwardEnabled()

describe('workspace port forward flag', () => {
  it('stays off until the renderer registers it', () => {
    expect(enabledBeforeRegistration).toBe(false)
    enableWorkspacePortForward()
    expect(workspacePortForwardEnabled()).toBe(true)
  })
})
