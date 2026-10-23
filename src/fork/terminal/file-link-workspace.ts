// 终端和原生对话的文件链接留在当前工作区。缺省为开：只有用户显式关掉才回到上游。
const SETTING_KEY = 'terminalFileLinksOpenInCurrentWorkspace'

export function terminalFileLinksOpenInCurrentWorkspace(
  settings: object | null | undefined
): boolean {
  if (settings == null || !(SETTING_KEY in settings)) {
    return true
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the profile JSON stores this beside GlobalSettings; upstream's type omits the field.
  const value = (settings as Record<string, unknown>)[SETTING_KEY]
  return value !== false
}
