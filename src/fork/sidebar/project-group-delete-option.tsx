// The delete-project-group dialog's "Ungroup only" checkbox. Mounted with the dialog content, so
// each open starts from the option's default.
import React, { useEffect, useId, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  getDeleteProjectGroupDialogOption,
  registerDeleteProjectGroupOptionRenderer,
  setDeleteProjectGroupDialogOptionChecked
} from '../../shared/fork-hooks/project-group-delete'

function DeleteProjectGroupOption({ disabled }: { disabled: boolean }): React.JSX.Element | null {
  const option = getDeleteProjectGroupDialogOption()
  const id = useId()
  const [checked, setChecked] = useState(option?.defaultChecked === true)
  useEffect(() => {
    // The confirm reads the choice from the registry, so it must follow this checkbox.
    setDeleteProjectGroupDialogOptionChecked(checked)
  }, [checked])
  if (!option) {
    return null
  }
  return (
    <div className="flex w-full items-start gap-2 rounded-sm px-1 py-1 text-foreground/85">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => setChecked(next === true)}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <Label htmlFor={id}>{option.label}</Label>
        {option.description ? (
          <span className="mt-0.5 block text-muted-foreground">{option.description}</span>
        ) : null}
      </span>
    </div>
  )
}

export function registerDeleteProjectGroupOptionCheckbox(): void {
  registerDeleteProjectGroupOptionRenderer((disabled) => (
    <DeleteProjectGroupOption disabled={disabled} />
  ))
}
