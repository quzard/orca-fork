// fork: 插件 host 调用失败时带一个稳定原因（例如 server-method-missing）。
// 上游 PluginHostCallError 的第 4、5 个参数是 detail 和 ErrorOptions，所以原因放在子类里。
import type { PluginErrorCode } from '../../shared/plugins/frames/plugin-protocol'
import { PluginHostCallError } from '../../main/plugins/workers/host-api/plugin-host-call-scope'

export class ForkPluginHostCallError extends PluginHostCallError {
  constructor(
    code: PluginErrorCode,
    message: string,
    readonly reason: string
  ) {
    super(code, message)
  }
}

/** 上游 host 调用的错误没有原因，返回 undefined。 */
export function forkPluginHostErrorReason(error: PluginHostCallError): string | undefined {
  return error instanceof ForkPluginHostCallError ? error.reason : undefined
}
