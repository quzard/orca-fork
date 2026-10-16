import { describe, expect, it } from 'vitest'
import { adjustRemoteOpenRoute } from './remote-open-route'
import { resolveEnvironmentSshTargetId } from './environment-ssh-target'

const labels = new Map([['ssh-builder', 'builder']])

describe('remote open route', () => {
  it('enables cursor and vscode for a direct ssh workspace', () => {
    const context = {
      worktreePath: '/home/user/project',
      connectionId: 'ssh-builder',
      target: 'external-editor' as const,
      command: 'cursor'
    }
    expect(
      adjustRemoteOpenRoute(context, {
        sshTargetLabels: labels,
        sshTargetsHydrated: true
      })
    ).toEqual({ disabled: false, metadata: 'Remote SSH', connectionId: 'ssh-builder' })
    expect(
      adjustRemoteOpenRoute(
        { ...context, command: 'code' },
        { sshTargetLabels: labels, sshTargetsHydrated: true }
      )?.connectionId
    ).toBe('ssh-builder')
  })

  it('uses the managed server ssh target and refuses a missing or file-manager route', () => {
    expect(
      resolveEnvironmentSshTargetId({
        runtimeEnvironmentId: 'env-1',
        orcadDeploymentSshTargetId: 'ssh-builder',
        sshTargetLabels: labels,
        sshTargetsHydrated: true
      })
    ).toBe('ssh-builder')
    expect(
      resolveEnvironmentSshTargetId({
        runtimeEnvironmentId: 'env-1',
        orcadDeploymentSshTargetId: 'ssh-gone',
        sshTargetLabels: labels,
        sshTargetsHydrated: true
      })
    ).toBeNull()
    expect(
      adjustRemoteOpenRoute(
        {
          worktreePath: '/home/user/project',
          runtimeEnvironmentId: 'env-1',
          target: 'external-editor',
          command: 'cursor'
        },
        {
          orcadDeploymentSshTargetId: 'ssh-builder',
          sshTargetLabels: labels,
          sshTargetsHydrated: true
        }
      )?.connectionId
    ).toBe('ssh-builder')
    expect(
      adjustRemoteOpenRoute(
        {
          worktreePath: '/home/user/project',
          connectionId: 'ssh-builder',
          target: 'file-manager',
          command: 'cursor'
        },
        { sshTargetLabels: labels, sshTargetsHydrated: true }
      )
    ).toBeNull()
  })
})
