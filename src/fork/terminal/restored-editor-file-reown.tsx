// 文件内容加载器顶到行数上限。这段是上游的归属迁移，从加载器挪过来，行为不变。
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { RuntimeWorkspaceFileRoute } from '@/lib/runtime-workspace-file-route'
import type { FileContent } from '../../renderer/src/components/editor/editor-panel-content-types'
import {
  migrateRestoredEditorFileOwner,
  restoredOwnerMigrationErrorMessage
} from '../../renderer/src/components/editor/migrate-restored-editor-file-owner'

export async function reownRestoredEditorFile(args: {
  id: string
  generation: number
  route: RuntimeWorkspaceFileRoute
  runtimeEnvironmentId: string | null
  fileReadGenerationCounterRef: MutableRefObject<number>
  fileReadGenerationRef: MutableRefObject<Record<string, number>>
  setFileContents: Dispatch<SetStateAction<Record<string, FileContent>>>
}): Promise<void> {
  const migration = await migrateRestoredEditorFileOwner(
    args.id,
    args.route,
    args.runtimeEnvironmentId
  )
  if (!migration.ok) {
    throw new Error(restoredOwnerMigrationErrorMessage(migration.reason))
  }
  if (args.fileReadGenerationRef.current[args.id] !== args.generation) {
    return
  }
  args.fileReadGenerationRef.current[args.id] = ++args.fileReadGenerationCounterRef.current
  args.setFileContents((prev) => {
    const next = { ...prev }
    delete next[args.id]
    return next
  })
}
