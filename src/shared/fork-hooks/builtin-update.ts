// fork: 版本比较。electron-updater 用 semver，正式版高于同一核心版本的 prerelease。

import { compareAppVersions } from '../app-version'

/**
 * 同一核心版本下，正式版高于带 prerelease 的本地包。
 * `1.4.228` 因此比 `1.4.228-local.*` 新；未改发布源时，公开源会把它当成可安装更新。
 */
export function upstreamStableSupersedesForkBuild(current: string, upstream: string): boolean {
  return compareAppVersions(upstream, current) > 0
}
