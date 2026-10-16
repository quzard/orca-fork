import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { WorktreeGroupBy } from './worktree-list/grouping/row-types'
import {
  listSidebarGroupModes,
  registeredReplacementForBuiltinGroupBy
} from '../../../../shared/fork-hooks/sidebar-group-mode'
import { GROUP_BY_OPTIONS } from './sidebar-workspace-option-items'

type SidebarGroupByToggleProps = {
  groupBy: WorktreeGroupBy
  setGroupBy: (groupBy: WorktreeGroupBy) => void
}

export function SidebarGroupByToggle({ groupBy, setGroupBy }: SidebarGroupByToggleProps) {
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
      {/* fork: a registered mode that replaces Project is the saved Project view. */}
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
