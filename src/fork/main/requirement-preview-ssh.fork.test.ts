import { describe, expect, it } from 'vitest'
import { deployOrcad } from '../../main/ssh/orcad-remote-deploy'
import type { OrcadDeployOptions } from '../../main/ssh/orcad-remote-deploy'

describe('requirement preview ssh deploy', () => {
  it('throws before contacting a remote daemon', async () => {
    const previous = process.env.ORCA_REQUIREMENT_PREVIEW
    process.env.ORCA_REQUIREMENT_PREVIEW = '1'
    try {
      const options = {
        conn: { getTarget: () => ({ id: 'devbox', label: 'devbox' }) }
      }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: deploy reads only conn.getTarget before the preview refusal throws.
      await expect(deployOrcad(options as OrcadDeployOptions)).rejects.toThrow(/does not open SSH/)
    } finally {
      if (previous === undefined) {
        delete process.env.ORCA_REQUIREMENT_PREVIEW
      } else {
        process.env.ORCA_REQUIREMENT_PREVIEW = previous
      }
    }
  })
})
