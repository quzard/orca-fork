// 预览身份只改启动路径和协议。未设置环境、包名和 package 标记时，日常 Orca 的目录不变。
import { join, resolve } from 'node:path'

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
  env: NodeJS.ProcessEnv
  appData: string
  productName?: string | null
  packageMarker?: boolean
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
    input.env[REQUIREMENT_PREVIEW_ENV] === '1' ||
    input.productName === PREVIEW_PRODUCT_NAME ||
    input.packageMarker === true
  )
}

/** 显式用户数据目录也不能指回日常 Orca、开发目录或当前进程已经在用的生产目录。 */
export function resolveRequirementPreviewLaunch(
  input: PreviewLaunchInput & { occupiedUserDataPath?: string | null }
): PreviewLaunch {
  if (!isRequirementPreviewLaunch(input)) {
    return { enabled: false }
  }
  const requested = input.env[REQUIREMENT_PREVIEW_USER_DATA_ENV]?.trim()
  const userDataPath = requested ? resolve(requested) : join(input.appData, PREVIEW_PRODUCT_NAME)
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
    sshOptInIgnored: input.env[REQUIREMENT_PREVIEW_SSH_ENV] === '1'
  }
}

export function requirementPreviewSshRefusal(env: NodeJS.ProcessEnv = process.env): string | null {
  return env[REQUIREMENT_PREVIEW_ENV] === '1' ? PREVIEW_SSH_REFUSAL : null
}

export function requirementPreviewBlocksUpdater(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[REQUIREMENT_PREVIEW_ENV] === '1'
}
