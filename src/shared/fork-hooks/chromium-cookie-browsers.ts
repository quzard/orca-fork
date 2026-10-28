// fork: 额外的 Chromium cookie 来源。未登记时发现、选配置和提示名单都只认上游浏览器。

import type { BrowserSessionProfileSource } from '../browser-workspace-types'

export type ForkChromiumCookieBrowser = {
  family: BrowserSessionProfileSource['browserFamily']
  label: string
  keychainService: string
  keychainAccount: string
  macRoot?: string
  winRoot?: string
  linuxRoot?: string
}

let extraBrowsers: readonly ForkChromiumCookieBrowser[] = []

/** 整表替换。桌面、渲染进程和 orcad 各自登记同一份，后一次不会叠出重复项。 */
export function registerForkChromiumCookieBrowsers(
  browsers: readonly ForkChromiumCookieBrowser[]
): void {
  extraBrowsers = browsers
}

export function forkChromiumCookieBrowsers(): readonly ForkChromiumCookieBrowser[] {
  return extraBrowsers
}
