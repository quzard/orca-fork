// 托管 orcad：工作区都不认领时，存在的普通文件只读打开。凭据目录不发授权。
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isENOENT } from '../../main/ipc/filesystem-path-containment'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import type { RuntimeTerminalPathResolution } from '../../shared/runtime-file-contracts'
import type {
  DisownedHostFileArtifacts,
  DisownedHostFileRequest
} from '../../shared/fork-hooks/terminal-disowned-host-file'

const CREDENTIAL_DIR_NAMES = ['.ssh', '.gnupg', '.orca', '.aws'] as const

function isCredentialPath(absolutePath: string): boolean {
  const normalized = resolve(absolutePath)
  const home = homedir()
  return CREDENTIAL_DIR_NAMES.some((name) => isPathInsideOrEqual(join(home, name), normalized))
}

export async function openManagedDisownedHostFile(
  request: DisownedHostFileRequest,
  artifacts: DisownedHostFileArtifacts
): Promise<RuntimeTerminalPathResolution | null> {
  // SSH 路由不能拿这台机器的磁盘冒充远端。没要跨工作区时保持上游的 exists:false。
  if (!request.crossWorkspace || request.connectionId) {
    return null
  }
  if (isCredentialPath(request.absolutePath)) {
    return null
  }
  try {
    // 和对话引用同一条规范化：软链先落到真实文件。落到凭据目录同样拒绝。
    const artifactPath = await artifacts.resolveNativeChatArtifactPath(request.absolutePath)
    if (isCredentialPath(artifactPath)) {
      return null
    }
    const granted = await artifacts.resolveAbsoluteFileGrant({
      worktreeId: request.worktreeId,
      artifactPath,
      rejectedAbsolutePath: request.absolutePath,
      clientId: request.clientId,
      readOnly: true,
      provenance: 'disowned-host'
    })
    // 目录没有源码视图，交给调用方按「存在的目录」拒绝。硬链接授权层会拒绝，保持 exists:false。
    if (granted.openTarget?.kind === 'absolute-file' || granted.isDirectory) {
      return granted
    }
    return null
  } catch (error) {
    if (isENOENT(error)) {
      return null
    }
    throw error
  }
}
