// 预览运行时只解析预览输出树。缺文件就失败，不用日常 out/ 顶上。
import { join, posix, win32 } from 'node:path'
import { isRequirementPreviewBuild } from './build-flag'

export const PREVIEW_OUTPUT_ROOT = 'out-requirement-preview'
export const DAILY_OUTPUT_ROOT = 'out'

export function packagedCliEntryPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const pathApi = platform === 'win32' ? win32 : posix
  return pathApi.join(resourcesPath, 'app.asar.unpacked', runtimeOutputRoot(), 'cli', 'index.js')
}

export function keepPreviewUserData(
  previewPath: string,
  currentPath: string,
  setPath: (path: string) => void
): void {
  if (isRequirementPreviewBuild() && currentPath !== previewPath) {
    setPath(previewPath)
  }
}

export function runtimeOutputRoot(preview = isRequirementPreviewBuild()): string {
  return preview ? PREVIEW_OUTPUT_ROOT : DAILY_OUTPUT_ROOT
}

export function resolveRuntimeOutputEntry(input: {
  basePath: string
  segments: readonly string[]
  preview?: boolean
  exists?: (path: string) => boolean
}): string {
  const preview = input.preview ?? isRequirementPreviewBuild()
  const exists = input.exists ?? (() => true)
  const candidates = [
    join(input.basePath, ...input.segments),
    join(input.basePath, runtimeOutputRoot(preview), ...input.segments),
    join(input.basePath, '..', ...input.segments)
  ]
  const found = candidates.find((path) => exists(path))
  if (found) {
    return found
  }
  const preferred = candidates[1]
  if (!preview) {
    return preferred
  }
  throw new Error(
    `Requirement preview is missing ${preferred} and will not use ${join(input.basePath, DAILY_OUTPUT_ROOT, ...input.segments)}.`
  )
}
