// 构建期替换成 true/false。日常包是 false，终端里的环境变量改不了它。
declare const ORCA_REQUIREMENT_PREVIEW_BUILD: boolean

export function isRequirementPreviewBuild(): boolean {
  try {
    return ORCA_REQUIREMENT_PREVIEW_BUILD === true
  } catch {
    return false
  }
}
