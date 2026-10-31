import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import { WORKSPACE_REPOSITORY_RPC_TIMEOUT_MS } from '../git-workspace/constants'

// 一律走 runtime RPC：本机由桌面主进程执行，托管 SSH 由那台主机的 orcad 执行。
export function callWorkspaceGit<T>(
  target: RuntimeClientTarget,
  method: string,
  params: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  return callRuntimeRpc<T>(target, method, params, {
    timeoutMs: options.timeoutMs ?? WORKSPACE_REPOSITORY_RPC_TIMEOUT_MS,
    ...(options.signal ? { signal: options.signal } : {})
  })
}
