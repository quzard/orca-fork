// Anchor retained panes to each group body so split changes do not reparent heavyweight DOM.

const ANCHOR_PREFIX = '--orca-tab-group-body-'

/**
 * 同一分栏组里叠放的 RetainedPaneHost（终端页和智能体会话盖层）共用这个属性。
 * 组 id 可能含路径字符，不能写进 CSS 选择器，比较时用 getAttribute。
 */
export const RETAINED_PANE_GROUP_ATTRIBUTE = 'data-retained-pane-group'

/** Hex-encode group IDs, including remote path-like IDs, to produce valid CSS dashed identifiers. */
export function tabGroupBodyAnchorName(groupId: string): string {
  const encoded = Array.from(groupId, (char) => char.codePointAt(0)?.toString(16) ?? '').join('-')
  return `${ANCHOR_PREFIX}${encoded || 'empty'}`
}
