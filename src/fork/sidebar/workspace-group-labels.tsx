// fork: user-facing text for cross-group drops. Fork keys, with zh in src/fork/i18n/zh.json.
import { getIntlLocale } from '../../renderer/src/i18n/i18n'
import { forkTranslate } from '../i18n/fork-translate'

export const workspaceGroupLabels = {
  get hostMismatch(): string {
    return forkTranslate(
      'fork.sidebar.groupHostMismatch',
      'Workspaces can only move within the same host.'
    )
  },
  get notOnHost(): string {
    return forkTranslate('fork.sidebar.groupNotOnHost', 'This group is not saved on that host.')
  },
  get moveFailed(): string {
    return forkTranslate('fork.sidebar.groupMoveFailed', 'Could not move the workspace.')
  },
  /** The drop error, then the workspaces a rollback left in the new group, by display name. */
  rollbackFailed(error: string, names: readonly string[]): string {
    return forkTranslate(
      'fork.sidebar.groupRollbackFailed',
      '{{error}} Could not put back: {{names}}.',
      {
        error,
        names: new Intl.ListFormat(getIntlLocale(), { type: 'conjunction' }).format(names)
      }
    )
  }
}
