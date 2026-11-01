// fork (F050): 智能体会话盖层和同组终端是两只 RetainedPaneHost，不在同一个 .pane 里。
// 未登记时不写属性、不记分栏组，宿主和上游一样。

export const RETAINED_PANE_GROUP_ATTRIBUTE = 'data-retained-pane-group'

let noteGroup: ((groupId: string) => void) | null = null

export function registerCoveredTerminalGroups(note: (groupId: string) => void): void {
  noteGroup = note
}

export function resetCoveredTerminalGroupsForTests(): void {
  noteGroup = null
}

/** 登记之后才把分栏组写到宿主上，样式表才能只藏这一组旁边的 xterm。 */
export function retainedPaneGroupMarker(groupId: string | undefined): {
  [RETAINED_PANE_GROUP_ATTRIBUTE]?: string
} {
  if (!groupId || !noteGroup) {
    return {}
  }
  return { [RETAINED_PANE_GROUP_ATTRIBUTE]: groupId }
}

/** 样式规则按分栏组生成；没登记或没有组 id 时什么都不做。 */
export function noteRetainedPaneGroup(groupId: string | undefined): void {
  if (groupId && noteGroup) {
    noteGroup(groupId)
  }
}
