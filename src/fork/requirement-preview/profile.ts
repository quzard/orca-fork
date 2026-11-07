// 预览身份只改启动路径和协议。未设置环境、包名和 package 标记时，日常 Orca 的目录不变。
import { join, resolve } from 'node:path'
import { isRequirementPreviewBuild } from './build-flag'

export const PREVIEW_APP_ID = 'com.quzard.orca.requirement-preview'
export const PREVIEW_PRODUCT_NAME = 'Orca Requirement Preview'
export const PREVIEW_PROTOCOL = 'orca-requirement-preview'
export const REQUIREMENT_PREVIEW_ENV = 'ORCA_REQUIREMENT_PREVIEW'
export const REQUIREMENT_PREVIEW_USER_DATA_ENV = 'ORCA_REQUIREMENT_PREVIEW_USER_DATA'
export const REQUIREMENT_PREVIEW_SSH_ENV = 'ORCA_REQUIREMENT_PREVIEW_SSH'
export const PREVIEW_APP_NAME = PREVIEW_PRODUCT_NAME

/** 远程 orcad 和这台机器上的日常 Orca 共用套接字时无法拆开，所以预览始终不连 SSH。 */
export const PREVIEW_SSH_REFUSAL =
  'Requirement preview does not open SSH or upgrade a remote Orca. The remote daemon cannot be isolated from the daily app.'

const PRODUCTION_DIR_NAMES = ['Orca', 'orca-dev', 'Orca Dev']

export type PreviewLaunchInput = {
  appData: string
  productName?: string | null
  packageMarker?: boolean
  buildFlag?: boolean
  sshOptIn?: boolean
}

export type PreviewLaunch =
  | { enabled: false }
  | {
      enabled: true
      appName: string
      appId: string
      protocol: string
      userDataPath: string
      updater: false
      ssh: false
      sshOptInIgnored: boolean
    }
  | { enabled: true; refused: string }

function samePath(left: string, right: string): boolean {
  return resolve(left) === resolve(right)
}

export function isRequirementPreviewLaunch(input: PreviewLaunchInput): boolean {
  return (
    input.buildFlag === true ||
    input.productName === PREVIEW_PRODUCT_NAME ||
    input.packageMarker === true
  )
}

/** 用户数据目录只有 appData 下的预览产品名。不接受任意覆盖，避免大小写别名或生产目录嵌套。 */
export function resolveRequirementPreviewLaunch(
  input: PreviewLaunchInput & { occupiedUserDataPath?: string | null }
): PreviewLaunch {
  if (!isRequirementPreviewLaunch(input)) {
    return { enabled: false }
  }
  const userDataPath = join(input.appData, PREVIEW_PRODUCT_NAME)
  const blocked = [
    ...PRODUCTION_DIR_NAMES.map((name) => join(input.appData, name)),
    ...(input.occupiedUserDataPath ? [input.occupiedUserDataPath] : [])
  ]
  const hit = blocked.find((path) => samePath(path, userDataPath))
  if (hit) {
    return {
      enabled: true,
      refused: `Requirement preview refused userData ${userDataPath} because it is the daily Orca profile (${hit}).`
    }
  }
  return {
    enabled: true,
    appName: PREVIEW_APP_NAME,
    appId: PREVIEW_APP_ID,
    protocol: PREVIEW_PROTOCOL,
    userDataPath,
    updater: false,
    ssh: false,
    sshOptInIgnored: input.sshOptIn === true
  }
}

export function assertRequirementPreviewRemoteClosed(): void {
  const refusal = requirementPreviewSshRefusal()
  if (refusal) {
    throw new Error(refusal)
  }
}

export function requirementPreviewSshRefusal(): string | null {
  return isRequirementPreviewBuild() ? PREVIEW_SSH_REFUSAL : null
}

export function requirementPreviewBlocksUpdater(): boolean {
  return isRequirementPreviewBuild()
}
