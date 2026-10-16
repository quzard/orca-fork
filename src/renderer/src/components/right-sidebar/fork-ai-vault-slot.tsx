import type { ReactNode } from 'react'
import {
  getAiVaultPanelSlot,
  type AiVaultPanelSlotId
} from '../../../../shared/fork-hooks/ai-vault'

// fork: 插槽未登记时返回 null，不产生 DOM 节点。
export function ForkAiVaultSlot({ id }: { id: AiVaultPanelSlotId }): ReactNode {
  const render = getAiVaultPanelSlot(id)
  if (!render) {
    return null
  }
  const node: unknown = render()
  if (node == null || node === false) {
    return null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a registered slot returns a React node; the default build registers none.
  return node as ReactNode
}
