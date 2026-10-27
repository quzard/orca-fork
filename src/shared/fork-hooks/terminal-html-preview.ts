// fork: 终端或对话里点开的远程 HTML，用应用内文档预览渲染。
// 未登记 SSH 读取时，直连 SSH 仍是上游的 404。授权文件的读取记录不靠登记，跟着预览授权走。

export type TerminalHtmlPreviewLocation = {
  owner:
    | { kind: 'ssh'; connectionId: string }
    | {
        kind: 'runtime'
        environmentId: string
        worktreeSelector: string
        worktreeRoot: string
      }
  requestBase: string
  root: string
  entryRelativePath: string
  /** 托管 orcad 发给工作区外文件的只读授权。预览只读这一份绝对路径。 */
  terminalArtifactGrantId?: string
  terminalArtifactAbsolutePath?: string
  /** 直连 SSH、工作区外的 HTML。桌面按这条去读远端文件，不把 ssh: 当成一般文档预览。 */
  sshPreview?: boolean
}

export type SshHtmlPreviewRead =
  | { ok: true; bytes: Buffer }
  | { ok: false; status: number; reason: 'too-large' | 'unreadable'; message: string }

type SshHtmlPreviewReader = (
  connectionId: string,
  absolutePath: string
) => Promise<SshHtmlPreviewRead | null>

type Serve = { kind: 'artifact'; grantId: string; absolutePath: string } | { kind: 'ssh' }

const locations = new Map<string, TerminalHtmlPreviewLocation>()
const serves = new Map<string, Serve>()
// 只有地址栏提交写进来。点击记下的预览不在这里，关路由时不能一起清掉。
const addressBarKeys = new Set<string>()

let sshReader: SshHtmlPreviewReader | null = null

type ManagedSshAddressPreviewBridge = {
  eligible(worktreeId: string, filePath: string, state: unknown): boolean
  remember(worktreeId: string, filePath: string, state: unknown): boolean
  routeEligible(worktreeId: string, state: unknown): boolean
}

let addressPreview: ManagedSshAddressPreviewBridge | null = null

/** 登记地址栏的托管 SSH 预览。传 null 取消。未登记时解析保持上游拒绝。 */
export function registerManagedSshAddressPreview(
  next: ManagedSshAddressPreviewBridge | null
): void {
  addressPreview = next
}

/** 解析用。不写记录。 */
export function managedSshAddressPreviewEligible(
  worktreeId: string,
  filePath: string,
  state: unknown
): boolean {
  return addressPreview?.eligible(worktreeId, filePath, state) === true
}

/** 提交导航时才写记录。 */
export function commitManagedSshAddressPreview(
  worktreeId: string,
  filePath: string,
  state: unknown
): boolean {
  return addressPreview?.remember(worktreeId, filePath, state) === true
}

/** 已记下的 SSH 预览是否还能放行。未登记或路由关掉时不算。 */
export function managedSshAddressRouteEligible(worktreeId: string, state: unknown): boolean {
  return addressPreview?.routeEligible(worktreeId, state) === true
}

function locationKey(worktreeId: string, filePath: string): string {
  return `${worktreeId}\0${filePath}`
}

/** 打开预览标签之前记下。HtmlDocPreview 再按工作区和路径取回。 */
export function rememberTerminalHtmlPreview(
  worktreeId: string,
  filePath: string,
  location: TerminalHtmlPreviewLocation
): void {
  locations.set(locationKey(worktreeId, filePath), location)
}

export function lookupTerminalHtmlPreview(
  worktreeId: string,
  filePath: string
): TerminalHtmlPreviewLocation | null {
  return locations.get(locationKey(worktreeId, filePath)) ?? null
}

/** 铸预览授权时记下怎么读。撤销时忘掉。 */
export function noteTerminalHtmlPreviewServe(
  previewGrantId: string,
  request: Pick<
    TerminalHtmlPreviewLocation,
    'terminalArtifactGrantId' | 'terminalArtifactAbsolutePath' | 'sshPreview'
  >
): void {
  if (request.terminalArtifactGrantId && request.terminalArtifactAbsolutePath) {
    serves.set(previewGrantId, {
      kind: 'artifact',
      grantId: request.terminalArtifactGrantId,
      absolutePath: request.terminalArtifactAbsolutePath
    })
    return
  }
  if (request.sshPreview === true) {
    serves.set(previewGrantId, { kind: 'ssh' })
  }
}

export function terminalHtmlPreviewServe(previewGrantId: string): Serve | null {
  return serves.get(previewGrantId) ?? null
}

export function forgetTerminalHtmlPreviewServe(previewGrantId: string): void {
  serves.delete(previewGrantId)
}

/** 桌面登记直连 SSH 的读取。传 null 取消。未登记时预览保持上游的 404。 */
export function registerSshHtmlPreviewRead(next: SshHtmlPreviewReader | null): void {
  sshReader = next
}

export function readSshHtmlPreview(
  connectionId: string,
  absolutePath: string
): Promise<SshHtmlPreviewRead | null> {
  return sshReader ? sshReader(connectionId, absolutePath) : Promise.resolve(null)
}

/** 地址栏提交写过这条路径。点击之后再记同一条时要拿掉，关路由才不会清掉点击的预览。 */
export function markAddressBarTerminalHtmlPreview(worktreeId: string, filePath: string): void {
  addressBarKeys.add(locationKey(worktreeId, filePath))
}

export function unmarkAddressBarTerminalHtmlPreview(worktreeId: string, filePath: string): void {
  addressBarKeys.delete(locationKey(worktreeId, filePath))
}

/** 路由关掉或目标进禁用列表时，只丢掉地址栏写的记录。 */
export function forgetIneligibleAddressBarTerminalHtmlPreviews(
  stillEligible: (worktreeId: string) => boolean
): void {
  for (const key of addressBarKeys) {
    const worktreeId = key.slice(0, key.indexOf('\0'))
    if (stillEligible(worktreeId)) {
      continue
    }
    addressBarKeys.delete(key)
    locations.delete(key)
  }
}

export function resetTerminalHtmlPreviewForTests(): void {
  locations.clear()
  serves.clear()
  addressBarKeys.clear()
  sshReader = null
}
