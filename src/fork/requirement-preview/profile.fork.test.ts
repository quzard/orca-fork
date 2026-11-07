import { describe, expect, it } from 'vitest'
import { daemonRuntimeDirFor } from '../../main/daemon/endpoint/publication/daemon-runtime-dir'
import { shortDaemonSocketDir } from '../../main/daemon/endpoint/publication/daemon-socket-endpoint-path'
import { stripInheritedBuildModeEnv } from '../../main/pty/shell-startup/build-mode-env'
import { allowFolderParentSet } from '../../shared/fork-hooks/requirement-preview'
import { isRequirementPreviewBuild } from './build-flag'
import { readPreviewPackaging } from './packaging.cjs'
import {
  PREVIEW_APP_ID,
  PREVIEW_PRODUCT_NAME,
  PREVIEW_PROTOCOL,
  REQUIREMENT_PREVIEW_ENV,
  REQUIREMENT_PREVIEW_SSH_ENV,
  REQUIREMENT_PREVIEW_USER_DATA_ENV,
  requirementPreviewBlocksUpdater,
  requirementPreviewSshRefusal,
  resolveRequirementPreviewLaunch
} from './profile'

describe('requirement preview identity', () => {
  it('stays off in a daily build even when the preview env is set', () => {
    expect(isRequirementPreviewBuild()).toBe(false)
    expect(allowFolderParentSet('folder:parent')).toBe(false)
    expect(readPreviewPackaging({})).toBeNull()
    expect(requirementPreviewSshRefusal()).toBeNull()
    expect(requirementPreviewBlocksUpdater()).toBe(false)
    expect(
      resolveRequirementPreviewLaunch({
        appData: '/tmp/app-data',
        productName: 'Orca'
      })
    ).toEqual({ enabled: false })
    const stripped = stripInheritedBuildModeEnv({
      [REQUIREMENT_PREVIEW_ENV]: '1',
      [REQUIREMENT_PREVIEW_USER_DATA_ENV]: '/tmp/Orca',
      [REQUIREMENT_PREVIEW_SSH_ENV]: '1',
      KEEP: '1'
    })
    expect(stripped[REQUIREMENT_PREVIEW_ENV]).toBeUndefined()
    expect(stripped[REQUIREMENT_PREVIEW_USER_DATA_ENV]).toBeUndefined()
    expect(stripped[REQUIREMENT_PREVIEW_SSH_ENV]).toBeUndefined()
    expect(stripped.KEEP).toBe('1')
  })

  it('uses a separate app id, output names, userData and daemon dir from the build flag', () => {
    expect(readPreviewPackaging({ ORCA_REQUIREMENT_PREVIEW: '1' })).toMatchObject({
      appId: PREVIEW_APP_ID,
      scheme: PREVIEW_PROTOCOL,
      outputDir: 'dist-requirement-preview',
      viteOutDir: 'out-requirement-preview',
      macArtifactName: 'orca-requirement-preview-macos-${arch}.${ext}'
    })
    const appData = '/tmp/app-data'
    const enabled = resolveRequirementPreviewLaunch({
      appData,
      buildFlag: true,
      sshOptIn: true
    })
    expect(enabled).toMatchObject({
      enabled: true,
      appId: PREVIEW_APP_ID,
      protocol: PREVIEW_PROTOCOL,
      updater: false,
      ssh: false,
      sshOptInIgnored: true,
      userDataPath: `${appData}/${PREVIEW_PRODUCT_NAME}`
    })
    expect(
      resolveRequirementPreviewLaunch({
        appData,
        productName: PREVIEW_PRODUCT_NAME
      })
    ).toMatchObject({ enabled: true, userDataPath: `${appData}/${PREVIEW_PRODUCT_NAME}` })
    expect(
      resolveRequirementPreviewLaunch({
        appData,
        packageMarker: true,
        occupiedUserDataPath: `${appData}/${PREVIEW_PRODUCT_NAME}`
      })
    ).toMatchObject({ enabled: true, refused: expect.stringContaining('daily Orca') })
    const daily = daemonRuntimeDirFor(`${appData}/Orca`)
    const preview = daemonRuntimeDirFor(`${appData}/${PREVIEW_PRODUCT_NAME}`)
    expect(preview).not.toBe(daily)
    expect(shortDaemonSocketDir(preview, 1000)).not.toBe(shortDaemonSocketDir(daily, 1000))
  })
})
