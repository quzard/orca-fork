import { describe, expect, it } from 'vitest'
import { daemonRuntimeDirFor } from '../../main/daemon/endpoint/publication/daemon-runtime-dir'
import { shortDaemonSocketDir } from '../../main/daemon/endpoint/publication/daemon-socket-endpoint-path'
import { readPreviewPackaging } from './packaging.cjs'
import {
  PREVIEW_APP_ID,
  PREVIEW_PROTOCOL,
  requirementPreviewBlocksUpdater,
  requirementPreviewSshRefusal,
  resolveRequirementPreviewLaunch
} from './profile'

describe('requirement preview identity', () => {
  it('uses a separate app id, protocol, userData and daemon dir, and refuses the daily profile', () => {
    expect(readPreviewPackaging({ ORCA_REQUIREMENT_PREVIEW: '1' })).toMatchObject({
      appId: PREVIEW_APP_ID,
      scheme: PREVIEW_PROTOCOL
    })
    expect(readPreviewPackaging({})).toBeNull()
    const appData = '/tmp/app-data'
    const enabled = resolveRequirementPreviewLaunch({
      env: { ORCA_REQUIREMENT_PREVIEW: '1' },
      appData
    })
    expect(enabled).toMatchObject({
      enabled: true,
      appId: PREVIEW_APP_ID,
      protocol: PREVIEW_PROTOCOL,
      updater: false,
      ssh: false,
      userDataPath: `${appData}/Orca Requirement Preview`
    })
    const daily = daemonRuntimeDirFor(`${appData}/Orca`)
    const preview = daemonRuntimeDirFor(`${appData}/Orca Requirement Preview`)
    expect(preview).not.toBe(daily)
    expect(shortDaemonSocketDir(preview, 1000)).not.toBe(shortDaemonSocketDir(daily, 1000))
    expect(
      resolveRequirementPreviewLaunch({
        env: {
          ORCA_REQUIREMENT_PREVIEW: '1',
          ORCA_REQUIREMENT_PREVIEW_USER_DATA: `${appData}/Orca`,
          ORCA_REQUIREMENT_PREVIEW_SSH: '1'
        },
        appData
      })
    ).toMatchObject({ enabled: true, refused: expect.stringContaining('daily Orca') })
    expect(
      requirementPreviewSshRefusal({
        ORCA_REQUIREMENT_PREVIEW: '1',
        ORCA_REQUIREMENT_PREVIEW_SSH: '1'
      })
    ).toContain('does not open SSH')
    expect(requirementPreviewBlocksUpdater({ ORCA_REQUIREMENT_PREVIEW: '1' })).toBe(true)
    expect(requirementPreviewSshRefusal({})).toBeNull()
  })
})
