// 终端文件链接留在当前工作区。缺省为开：只有用户显式关掉才回到上游。
import type { TerminalFileLinkWorkspaceSettings } from '../../shared/fork-hooks/terminal-file-link-workspace'

export function terminalFileLinksOpenInCurrentWorkspace(
  settings: TerminalFileLinkWorkspaceSettings | null | undefined
): boolean {
  return settings?.terminalFileLinksOpenInCurrentWorkspace !== false
}
