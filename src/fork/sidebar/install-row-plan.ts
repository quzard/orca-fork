// Attaches the renderer row plan. Safe to call more than once.
import { lookupSidebarGroupMode } from '../../shared/fork-hooks/sidebar-group-mode'
import { buildHostDirectoryRowPlan } from './host-directory-rows'
import { HOST_DIRECTORY_GROUP_BY } from './section-keys'

export function installHostDirectoryRowPlan(): void {
  const mode = lookupSidebarGroupMode(HOST_DIRECTORY_GROUP_BY)
  if (!mode) {
    return
  }
  mode.buildRowPlan = buildHostDirectoryRowPlan
}
