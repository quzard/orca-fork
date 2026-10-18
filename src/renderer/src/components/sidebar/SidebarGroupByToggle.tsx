import { useSyncExternalStore } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { WorktreeGroupBy } from '../../../../shared/sidebar-list/row-types'
import {
  getSidebarGroupModeLabelsVersion,
  listSidebarGroupModes,
  registeredReplacementForBuiltinGroupBy,
  subscribeSidebarGroupModeLabels
} from '../../../../shared/fork-hooks/sidebar-group-mode'
import { GROUP_BY_OPTIONS } from './sidebar-workspace-option-items'

type SidebarGroupByToggleProps = {
  groupBy: WorktreeGroupBy
  setGroupBy: (groupBy: WorktreeGroupBy) => void
}

export function SidebarGroupByToggle({ groupBy, setGroupBy }: SidebarGroupByToggleProps) {
  // fork: 登记模式的标签随界面语言变化，语言切换时重新渲染。未登记时版本号不变。
  useSyncExternalStore(subscribeSidebarGroupModeLabels, getSidebarGroupModeLabelsVersion)
  return (
    <ToggleGroup
      type="single"
      value={groupBy}
      onValueChange={(value) => {
        if (value) {
          setGroupBy(value as WorktreeGroupBy)
        }
      }}
      variant="outline"
      size="sm"
      className="h-6 w-full justify-stretch"
    >
      {/* fork: 替换 Project 的已登记模式就是保存下来的 Project 视图。 */}
      {[
        ...GROUP_BY_OPTIONS.filter((option) => !registeredReplacementForBuiltinGroupBy(option.id)),
        ...listSidebarGroupModes()
      ].map((option) => (
        <ToggleGroupItem
          key={option.id}
          value={option.id}
          // Why: inside the dropdown menu, Radix can focus a toggle item without
          // committing ToggleGroup's value change; capture the pointer intent
          // before the menu's roving-focus handling turns it into a no-op.
          onPointerDownCapture={() => {
            // fork: 登记 id 不在内置联合类型里。未登记时这里只有内置选项。
            // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: built-in ids already match WorktreeGroupBy; a registered id is accepted only by the registry.
            setGroupBy(option.id as WorktreeGroupBy)
          }}
          className="h-6 grow basis-0 px-1 text-[10px] data-[state=on]:bg-foreground/10 data-[state=on]:font-semibold data-[state=on]:text-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
