import { resolveOrcadBindHost } from '../../main/orcad/orcad-bind-address'
import { bindOrcadStopTerminalAdmission } from '../../main/orcad/orcad-stop-terminal-admission'

/**
 * 解析 orcad 监听地址，并在 RPC 开始监听前接上终端准入。
 * 停机已经开始时，之后进来的终端要算进这次退出。
 * 顺序和原来写在 orcad-entry 里的两行一样：地址不合法就抛错，不会先接上准入。
 * 这不是 fork 功能。两步合成一次调用，只因为 orcad-entry.ts 已经顶到 300 行。
 */
export function resolveOrcadServeBind(
  raw: string | undefined,
  admission: { holdUntilExit(): void }
): string {
  const host = resolveOrcadBindHost(raw)
  bindOrcadStopTerminalAdmission(admission)
  return host
}
