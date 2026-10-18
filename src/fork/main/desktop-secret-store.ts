import { homedir } from 'node:os'
import { join } from 'node:path'
import { usesIsolatedProfile } from '../../shared/electron-isolated-profile-switches'
import type { SecretStore } from '../../shared/secret-store'
import { LOCAL_SECRET_STORAGE, MacosFileSecretStore } from './macos-file-secret-store'

export function usesPackagedMacosFileSecretStore(input: {
  platform: string
  packaged: boolean
  isolated: boolean
}): boolean {
  return input.platform === 'darwin' && input.packaged && !input.isolated
}

export function macosFileSecretDirectory(home = homedir()): string {
  return join(home, LOCAL_SECRET_STORAGE.root, LOCAL_SECRET_STORAGE.directory)
}

type ElectronWithPackagedFlag = { app: { isPackaged: boolean } }
type ElectronSecretStoreModule = { ElectronSecretStore: new () => SecretStore }

export function createForkDesktopSecretStore(): SecretStore {
  // Loaded only when the main process installs the store. The renderer never calls this.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Electron's main export exposes `app.isPackaged` here.
  const electron = require('electron') as ElectronWithPackagedFlag
  if (
    usesPackagedMacosFileSecretStore({
      platform: process.platform,
      packaged: electron.app.isPackaged,
      isolated: usesIsolatedProfile()
    })
  ) {
    return new MacosFileSecretStore(macosFileSecretDirectory())
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: same module the desktop fallback constructs; called after that module finished evaluating.
  const host = require('../../main/host/electron-secret-store') as ElectronSecretStoreModule
  return new host.ElectronSecretStore()
}
