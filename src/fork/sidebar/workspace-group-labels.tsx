// fork: user-facing text for cross-group drops. Fork keys, with zh in src/fork/i18n/zh.json.
import { getIntlLocale, translate } from '../../renderer/src/i18n/i18n'

export const workspaceGroupLabels = {
  get hostMismatch(): string {
    return translate(
      'fork.sidebar.groupHostMismatch',
      'Workspaces can only move within the same host.'
    )
  },
  get notOnHost(): string {
    return translate('fork.sidebar.groupNotOnHost', 'This group is not saved on that host.')
  },
  get moveFailed(): string {
    return translate('fork.sidebar.groupMoveFailed', 'Could not move the workspace.')
  },
  /** The drop error, then the workspaces a rollback left in the new group, by display name. */
  rollbackFailed(error: string, names: readonly string[]): string {
    return translate(
      'fork.sidebar.groupRollbackFailed',
      '{{error}} Could not put back: {{names}}.',
      {
        error,
        names: new Intl.ListFormat(getIntlLocale(), { type: 'conjunction' }).format(names)
      }
    )
  }
}
