import { app } from 'electron'
import { AI_VAULT_ALL_HOST_TIMEOUT_MS } from '../../../main/ipc/ai-vault-all-host-timeouts'
import { listEnvironments } from '../../../shared/runtime-environment-store'
import type { KnownRuntimeEnvironment } from '../../../shared/runtime-environments'

type EnvironmentReader = () => readonly Pick<
  KnownRuntimeEnvironment,
  'id' | 'connectionDependency'
>[]

/**
 * 全部主机时每台 Orca 服务器的扫描预算。经 SSH 隧道连的服务器（SSH 部署的 orcad、SSH 访问）
 * 记录里有 `connectionDependency: 'ssh-tunnel'`，隧道上 3 秒不够，给和 SSH 中继一样的 15 秒；
 * 局域网、Tailscale 直连的仍是上游的 3 秒。读不到环境记录时也按上游。
 */
export function forkAiVaultAllHostRuntimeTimeout(
  hostInfo: { environmentId: string },
  readEnvironments: EnvironmentReader = () => listEnvironments(app.getPath('userData'))
): number {
  try {
    const environment = readEnvironments().find((entry) => entry.id === hostInfo.environmentId)
    if (environment?.connectionDependency === 'ssh-tunnel') {
      return AI_VAULT_ALL_HOST_TIMEOUT_MS.sshScanRelay
    }
  } catch {
    // 环境记录坏了或读不到：保持上游预算，不让这一台拖住合并。
  }
  return AI_VAULT_ALL_HOST_TIMEOUT_MS.runtimeScan
}
