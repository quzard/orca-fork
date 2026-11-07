import { DiffEditor } from '@monaco-editor/react'
import type { ReviewFileRef } from './overview-session'
import { forkTranslate } from '../i18n/fork-translate'

export function ReviewPane(props: {
  files: readonly { ref: ReviewFileRef; label: string }[]
  selected: readonly ReviewFileRef[]
  mode: 'diff' | 'content'
  left: string | null
  right: string | null
  loadError: string | null
  relativeBase: 'available' | 'unsupported' | 'error'
  onToggle: (file: ReviewFileRef) => void
  onMode: (mode: 'diff' | 'content') => void
  onLoadRelativeBase: () => void
}): React.JSX.Element {
  const leftRef = props.selected[0]
  const rightRef = props.selected[1]
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {forkTranslate(
          'fork.requirement.reviewHint',
          'Choose any two files. This view is read-only and does not stage, commit, or merge.'
        )}
      </p>
      <button
        type="button"
        className="self-start text-sm underline"
        onClick={props.onLoadRelativeBase}
      >
        {forkTranslate('fork.requirement.loadRelativeBase', 'Load relative base')}
      </button>
      {props.relativeBase !== 'available' ? (
        <p className="text-xs text-muted-foreground">
          {props.relativeBase === 'unsupported'
            ? forkTranslate(
                'fork.requirement.relativeBaseUnsupported',
                'Relative base stays unloaded until you ask. Workspaces without a base ref keep uncommitted files only.'
              )
            : forkTranslate(
                'fork.requirement.relativeBaseError',
                'Relative-base compare failed. Uncommitted files are still listed.'
              )}
        </p>
      ) : null}
      <ul className="max-h-40 overflow-auto rounded-md border border-border">
        {props.files.map((file) => {
          const selected = props.selected.some(
            (entry) =>
              entry.workspaceId === file.ref.workspaceId &&
              entry.relativePath === file.ref.relativePath &&
              entry.source === file.ref.source
          )
          return (
            <li key={`${file.ref.workspaceId}:${file.ref.source}:${file.ref.relativePath}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-accent/40"
                aria-pressed={selected}
                onClick={() => props.onToggle(file.ref)}
              >
                <span className="text-muted-foreground">{file.ref.source}</span>
                <span className="truncate">{file.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex gap-2">
        <button type="button" className="text-sm underline" onClick={() => props.onMode('diff')}>
          {forkTranslate('fork.requirement.diff', 'Diff')}
        </button>
        <button type="button" className="text-sm underline" onClick={() => props.onMode('content')}>
          {forkTranslate('fork.requirement.fullContent', 'Full content')}
        </button>
      </div>
      {props.loadError ? <p className="text-sm text-destructive">{props.loadError}</p> : null}
      {leftRef && rightRef && props.left != null && props.right != null ? (
        props.mode === 'content' ? (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            <pre className="overflow-auto rounded-md border border-border p-2 text-xs">
              {props.left}
            </pre>
            <pre className="overflow-auto rounded-md border border-border p-2 text-xs">
              {props.right}
            </pre>
          </div>
        ) : (
          <div className="min-h-48 flex-1 overflow-hidden rounded-md border border-border">
            <DiffEditor
              original={props.left}
              modified={props.right}
              language="plaintext"
              options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false } }}
            />
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          {forkTranslate('fork.requirement.pickTwo', 'Select two files to compare.')}
        </p>
      )}
    </div>
  )
}
