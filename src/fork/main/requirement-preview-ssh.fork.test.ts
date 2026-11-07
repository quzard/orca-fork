import { afterEach, describe, expect, it, vi } from 'vitest'
import { deployOrcad } from '../../main/ssh/orcad-remote-deploy'
import type { OrcadDeployOptions } from '../../main/ssh/orcad-remote-deploy'
import * as buildFlag from '../requirement-preview/build-flag'

describe('requirement preview remote deploy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ORCA_REQUIREMENT_PREVIEW
  })

  it('refuses SSH and WSL before contacting a remote daemon when the preview flag is on', async () => {
    vi.spyOn(buildFlag, 'isRequirementPreviewBuild').mockReturnValue(true)
    const options = {
      conn: { getTarget: () => ({ kind: 'wsl', id: 'devbox', label: 'devbox' }) }
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: deploy reads only conn.getTarget before the preview refusal throws.
    await expect(deployOrcad(options as OrcadDeployOptions)).rejects.toThrow(/does not open SSH/)
  })

  it('does not treat the preview env as a refusal in a daily build', async () => {
    vi.spyOn(buildFlag, 'isRequirementPreviewBuild').mockReturnValue(false)
    process.env.ORCA_REQUIREMENT_PREVIEW = '1'
    const options = {
      conn: { getTarget: () => ({ kind: 'wsl', id: 'devbox', label: 'devbox' }) }
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the assertion only checks the error text; the stub is incomplete on purpose.
    await expect(deployOrcad(options as OrcadDeployOptions)).rejects.not.toThrow(
      /does not open SSH/
    )
  })
})
