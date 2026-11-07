import { afterEach, describe, expect, it, vi } from 'vitest'
import { PREVIEW_APP_ID, PREVIEW_PRODUCT_NAME } from './profile'
import * as buildFlag from './build-flag'
import { getDevInstanceIdentity } from '../../main/startup/dev-instance-identity'

describe('packaged preview identity', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the daily name when the preview build flag is off', () => {
    vi.spyOn(buildFlag, 'isRequirementPreviewBuild').mockReturnValue(false)
    expect(getDevInstanceIdentity(false)).toMatchObject({
      appName: 'Orca',
      appUserModelId: 'com.stablyai.orca',
      isDev: false
    })
  })

  it('does not rename a packaged preview back to daily Orca', () => {
    vi.spyOn(buildFlag, 'isRequirementPreviewBuild').mockReturnValue(true)
    expect(getDevInstanceIdentity(false)).toMatchObject({
      name: PREVIEW_PRODUCT_NAME,
      appName: PREVIEW_PRODUCT_NAME,
      appUserModelId: PREVIEW_APP_ID,
      isDev: false
    })
  })
})
