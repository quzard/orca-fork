import type { App } from 'electron'
import { requirementPreviewBlocksUpdater } from '../../fork/requirement-preview/profile'
import { PREVIEW_PROTOCOL } from '../../fork/requirement-preview/profile'

/**
 * Registers `orca://` with Windows, which NSIS installs leave unregistered; macOS reads it from
 * Info.plist and Linux packages from the desktop entry. Only packaged desktop launches register,
 * so dev, test and serve runs never take over the machine's handler.
 */
export function registerOrcaProtocolClient(
  app: Pick<App, 'isPackaged' | 'isDefaultProtocolClient' | 'setAsDefaultProtocolClient'>,
  options: { platform: NodeJS.Platform; desktopLaunch: boolean }
): boolean {
  if (options.platform !== 'win32' || !app.isPackaged || !options.desktopLaunch) {
    return false
  }
  const scheme = requirementPreviewBlocksUpdater() ? PREVIEW_PROTOCOL : 'orca'
  if (app.isDefaultProtocolClient(scheme)) {
    return false
  }
  try {
    return app.setAsDefaultProtocolClient(scheme)
  } catch (error) {
    console.warn('[protocol] Failed to register orca:// links:', error)
    return false
  }
}
