import { app } from 'electron'
import {
  AI_VAULT_ALL_HOST_TIMEOUT_MS,
  allHostsRuntimeScanTimeoutMs
} from '../../../main/ipc/ai-vault-all-host-timeouts'
import { listEnvironments } from '../../../shared/runtime-environment-store'
import type { KnownRuntimeEnvironment } from '../../../shared/runtime-environments'

type EnvironmentReader = () => readonly Pick<
  KnownRuntimeEnvironment,
  'id' | 'connectionDependency'
>[]

/**
 * 全部主机时每台 Orca 服务器的扫描预算。经 SSH 隧道连的服务器（SSH 部署的 orcad、SSH 访问）
 * 是 15 秒；局域网、Tailscale 直连的仍是 3 秒。
 * 主机信息上已经有 `connectionDependency` 时直接用上游的判断，不再读盘。
 * 没带这个字段时仍查环境记录：记录是 `ssh-tunnel` 给 15 秒，读不到或不是隧道则 3 秒。
 */
export function forkAiVaultAllHostRuntimeTimeout(
  hostInfo: { environmentId: string; connectionDependency?: 'ssh-tunnel' },
  readEnvironments: EnvironmentReader = () => listEnvironments(app.getPath('userData'))
): number {
  if (hostInfo.connectionDependency) {
    return allHostsRuntimeScanTimeoutMs(hostInfo)
  }
  try {
    const environment = readEnvironments().find((entry) => entry.id === hostInfo.environmentId)
    if (environment?.connectionDependency === 'ssh-tunnel') {
      return AI_VAULT_ALL_HOST_TIMEOUT_MS.sshTunneledRuntimeScan
    }
  } catch {
    // 环境记录坏了或读不到：保持上游预算，不让这一台拖住合并。
  }
  return AI_VAULT_ALL_HOST_TIMEOUT_MS.runtimeScan
}
