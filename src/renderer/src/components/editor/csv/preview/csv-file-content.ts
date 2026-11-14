import type { RuntimeFileReadArgs } from '@/runtime/files/runtime-file-client-types'
import { readRuntimeFileContent } from '@/runtime/files/reads/runtime-file-read-client'
import {
  statRuntimeReadTarget,
  type RuntimeFileSnapshot
} from '@/runtime/files/reads/runtime-file-range-client'
<<<<<<< HEAD
import type { FileContent } from '../../editor-panel-content-types'
import { readHostCsv } from '../../../../../../shared/fork-hooks/host-file-ranges'
=======
import type { FileContent } from '../../loading/editor-panel-content-types'
>>>>>>> abcf0a559f8f5ffa4da4aff550920f2587b56ad3

import { CSV_PAGED_PREVIEW_BYTES } from '../csv-file-limits'

export type CsvFilePreview = { readArgs: RuntimeFileReadArgs; snapshot: RuntimeFileSnapshot }

export async function readEditorCsvFileContent(
  args: RuntimeFileReadArgs,
  allowPagedPreview = true
): Promise<FileContent> {
  const hostCsv = readHostCsv(args, allowPagedPreview, () => readRuntimeFileContent(args))
  if (hostCsv) {
    return hostCsv
  }
  // Why: a granted file opens whole, since older hosts cannot stat it for a paged preview.
  if (allowPagedPreview && !args.terminalArtifactGrantId && /\.(csv|tsv)$/i.test(args.filePath)) {
    const snapshot = await statRuntimeReadTarget(args)
    if (!snapshot.isDirectory && snapshot.size >= CSV_PAGED_PREVIEW_BYTES) {
      return { content: '', isBinary: false, csvPreview: { readArgs: args, snapshot } }
    }
  }
  return readRuntimeFileContent(args)
}
