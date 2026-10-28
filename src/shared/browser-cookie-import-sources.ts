import { forkChromiumCookieBrowsers } from './fork-hooks/chromium-cookie-browsers'

/** Human-readable import sources aligned with CHROMIUM_BROWSERS in
 *  browser-cookie-import.ts plus Firefox/Safari detection.
 *  Fork browsers are appended only after registration. */

const CHROMIUM_COOKIE_IMPORT_SOURCES = [
  { label: 'Google Chrome', mac: true, win: true, linux: true },
  { label: 'Microsoft Edge', mac: true, win: true, linux: true },
  { label: 'Arc', mac: true, win: false, linux: false },
  { label: 'Brave', mac: true, win: true, linux: true },
  { label: 'Comet', mac: true, win: true, linux: false },
  { label: 'Helium', mac: true, win: false, linux: false }
] as const

export function getBrowserCookieImportSourceLabels(
  platform: 'darwin' | 'win32' | 'linux'
): string[] {
  const labels: string[] = []
  for (const source of CHROMIUM_COOKIE_IMPORT_SOURCES) {
    if (platform === 'darwin' && source.mac) {
      labels.push(source.label)
    } else if (platform === 'win32' && source.win) {
      labels.push(source.label)
    } else if (platform === 'linux' && source.linux) {
      labels.push(source.label)
    }
  }
  // fork: 已登记、且该平台有根目录的浏览器。未登记时这份名单与上游一致。
  for (const extra of forkChromiumCookieBrowsers()) {
    const listed =
      (platform === 'darwin' && extra.macRoot) ||
      (platform === 'win32' && extra.winRoot) ||
      (platform === 'linux' && extra.linuxRoot)
    if (listed && !labels.includes(extra.label)) {
      labels.push(extra.label)
    }
  }
  labels.push('Firefox')
  if (platform === 'darwin') {
    labels.push('Safari')
  }
  return labels
}
