import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as buildFlag from './build-flag'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
    getAppPath: () => tmpdir()
  }
}))

import { CliInstaller } from '../../main/cli/cli-installer'

describe('preview cli installation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not create or remove the production orca command', async () => {
    vi.spyOn(buildFlag, 'isRequirementPreviewBuild').mockReturnValue(true)
    const home = mkdtempSync(join(tmpdir(), 'orca-preview-cli-'))
    const writes: string[] = []
    try {
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        homePath: home,
        userDataPath: join(home, 'userData'),
        resourcesPath: join(home, 'resources'),
        execPath: join(home, 'Orca Requirement Preview.app'),
        appPath: join(home, 'app'),
        defaultMacCommandPath: join(home, 'bin', 'orca'),
        privilegedRunner: async (command) => {
          writes.push(command)
        },
        appImagePath: null
      })
      await expect(installer.install()).rejects.toThrow(/does not install the orca command/)
      await expect(installer.remove()).rejects.toThrow(/does not remove the orca command/)
      expect(writes).toEqual([])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
