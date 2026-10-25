// fork: 托管 orcad 上，没有任何工作区认领的绝对路径。
// 未登记时 resolveTerminalPath 不 stat，仍返回 exists:false。
// 只在 orcad 登记打开函数。桌面进程不登记，避免本机运行时按任意路径发授权。

import type { RuntimeTerminalPathResolution } from '../runtime-file-contracts'

export type DisownedHostFileRequest = {
  worktreeId: string
  absolutePath: string
  clientId?: string
  connectionId?: string
  crossWorkspace: boolean
}

export type DisownedHostFileArtifacts = {
  resolveNativeChatArtifactPath(absolutePath: string): Promise<string>
  resolveAbsoluteFileGrant(args: {
    worktreeId: string
    artifactPath: string
    rejectedAbsolutePath?: string
    clientId?: string
    readOnly?: boolean
    provenance?: 'terminal-output' | 'native-chat' | 'disowned-host'
  }): Promise<RuntimeTerminalPathResolution>
}

type DisownedHostFileOpener = (
  request: DisownedHostFileRequest,
  artifacts: DisownedHostFileArtifacts
) => Promise<RuntimeTerminalPathResolution | null>

let opener: DisownedHostFileOpener | null = null

/** 登记打开函数。传 null 取消。 */
export function registerDisownedHostFileOpen(next: DisownedHostFileOpener | null): void {
  opener = next
}

/** 未登记时返回 null，调用方不 stat。 */
export function openDisownedHostFile(
  request: DisownedHostFileRequest,
  artifacts: DisownedHostFileArtifacts
): Promise<RuntimeTerminalPathResolution | null> {
  return opener ? opener(request, artifacts) : Promise.resolve(null)
}
