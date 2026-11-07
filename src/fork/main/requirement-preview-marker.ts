import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 打包进 asar 的 package.json 标记。读不到就当不是预览包。 */
export function readRequirementPreviewMarker(appPath: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')) as {
      orcaRequirementPreview?: unknown
    }
    return parsed.orcaRequirementPreview === true
  } catch {
    return false
  }
}
