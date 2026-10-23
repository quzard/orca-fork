import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'

// 一律走 runtime RPC。本机 git.diff 走 window.api.git，旧宿主没有这些方法。
export function callWorkspaceGit<T>(
  target: RuntimeClientTarget,
  method: string,
  params: unknown,
  signal?: AbortSignal
): Promise<T> {
  return callRuntimeRpc<T>(target, method, params, signal ? { signal } : {})
}
