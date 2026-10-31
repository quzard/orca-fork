import { describe, expect, it } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID, toSshExecutionHostId } from '../../shared/execution-host'
import { composerSeedForOpen } from '../../shared/fork-hooks/workspace-composer-seed'

const DEVBOX = toSshExecutionHostId('devbox')

describe('composerSeedForOpen', () => {
  it('prefills the group host and that group', () => {
    expect(
      composerSeedForOpen({
        telemetrySource: 'sidebar',
        initialProjectGroupId: 'grp-api',
        hasWorkspaceTarget: false,
        hasWorkspaceStatus: false,
        groupHostId: DEVBOX,
        activeHostId: LOCAL_EXECUTION_HOST_ID,
        activeGroupId: null
      })
    ).toEqual({ hostId: DEVBOX, sidebarGroupId: 'grp-api' })
  })

  it('prefills the active host and group for a blank sidebar composer', () => {
    expect(
      composerSeedForOpen({
        telemetrySource: 'sidebar',
        hasWorkspaceTarget: false,
        hasWorkspaceStatus: false,
        groupHostId: null,
        activeHostId: DEVBOX,
        activeGroupId: 'grp-web'
      })
    ).toEqual({ hostId: DEVBOX, sidebarGroupId: 'grp-web' })
  })

  it('leaves a status-board composer and an explicit repo alone', () => {
    const blank = {
      hasWorkspaceTarget: false,
      hasWorkspaceStatus: true,
      groupHostId: null,
      activeHostId: DEVBOX,
      activeGroupId: 'grp-web',
      telemetrySource: 'sidebar'
    }
    expect(composerSeedForOpen(blank)).toBeNull()
    expect(
      composerSeedForOpen({ ...blank, hasWorkspaceStatus: false, initialRepoId: 'repo-1' })
    ).toBeNull()
  })
})
