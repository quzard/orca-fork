// 预览里每个文件夹工作区都能打开需求概览，不要求已经有血缘。
import {
  requirementFolderCanOpen,
  requirementFolderOpen
} from '../../shared/fork-hooks/requirement-preview'
import { forkTranslate } from '../i18n/fork-translate'

export function RequirementFolderEntry(props: { folderId: string }): React.JSX.Element | null {
  if (!requirementFolderCanOpen()) {
    return null
  }
  return (
    <button
      type="button"
      className="pointer-events-auto text-xs underline"
      data-requirement-folder-entry={props.folderId}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        requirementFolderOpen(props.folderId)
      }}
    >
      {forkTranslate('fork.requirement.openFolder', 'Requirement')}
    </button>
  )
}
