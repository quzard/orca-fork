import { posixJoin } from './posix-path'
import { useEffect, useRef, useState } from 'react'
import type { GitDiffResult } from '../../shared/git/diff/git-diff-compare-types'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import type { Worktree } from '../../shared/worktree/types'
import { shouldLoadReviewFiles, type ReviewFileRef } from './overview-session'
import { ReviewPane } from './review-pane'

export function ReviewLoader(props: {
  files: { ref: ReviewFileRef; label: string }[]
  selected: ReviewFileRef[]
  mode: 'diff' | 'content'
  worktrees: readonly Worktree[]
  memberIds: readonly string[]
  folders: readonly FolderWorkspace[]
  contents: { left: string | null; right: string | null; error: string | null }
  onContents: (next: { left: string | null; right: string | null; error: string | null }) => void
  onToggle: (file: ReviewFileRef) => void
  onMode: (mode: 'diff' | 'content') => void
}): React.JSX.Element {
  const [relativeFiles, setRelativeFiles] = useState<{ ref: ReviewFileRef; label: string }[]>([])
  const [relativeBase, setRelativeBase] = useState<'available' | 'unsupported' | 'error'>(
    'unsupported'
  )
  const selectedKey = props.selected
    .map((file) => `${file.workspaceId}:${file.source}:${file.relativePath}`)
    .join('|')
  const relativeRequest = useRef(0)
  useEffect(() => {
    if (!shouldLoadReviewFiles(props.selected)) {
      return
    }
    const [left, right] = props.selected
    let cancelled = false
    void Promise.all([
      readReviewFile(left, props.worktrees, props.folders),
      readReviewFile(right, props.worktrees, props.folders)
    ]).then(([leftText, rightText]) => {
      if (cancelled) {
        return
      }
      props.onContents({
        left: leftText.ok ? leftText.text : null,
        right: rightText.ok ? rightText.text : null,
        error:
          leftText.ok && rightText.ok
            ? null
            : `${leftText.ok ? '' : leftText.error} ${rightText.ok ? '' : rightText.error}`.trim()
      })
    })
    return () => {
      cancelled = true
    }
    // 只在选中的两个文件变化时读取，概览渲染本身不读文件。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])
  return (
    <ReviewPane
      files={[...props.files, ...relativeFiles]}
      selected={props.selected}
      mode={props.mode}
      left={props.contents.left}
      right={props.contents.right}
      loadError={props.contents.error}
      relativeBase={relativeBase}
      onToggle={props.onToggle}
      onMode={props.onMode}
      onLoadRelativeBase={() => {
        const request = ++relativeRequest.current
        const members = props.worktrees.filter((worktree) => props.memberIds.includes(worktree.id))
        void loadRelativeBase(members).then((result) => {
          if (request !== relativeRequest.current) {
            return
          }
          setRelativeBase(result.status)
          setRelativeFiles(result.files)
        })
      }}
    />
  )
}

async function loadRelativeBase(worktrees: readonly Worktree[]): Promise<{
  status: 'available' | 'unsupported' | 'error'
  files: { ref: ReviewFileRef; label: string }[]
}> {
  const files: { ref: ReviewFileRef; label: string }[] = []
  let failed = false
  let sawBase = false
  for (const worktree of worktrees) {
    const baseRef = worktree.baseRef
    if (!baseRef) {
      continue
    }
    sawBase = true
    try {
      const result = await window.api.git.branchCompare({
        worktreePath: worktree.path,
        baseRef
      })
      for (const entry of result.entries) {
        files.push({
          ref: { workspaceId: worktree.id, relativePath: entry.path, source: 'relative-base' },
          label: `${worktree.displayName}: ${entry.path}`
        })
      }
    } catch {
      failed = true
    }
  }
  if (!sawBase) {
    return { status: 'unsupported', files: [] }
  }
  return { status: failed ? 'error' : 'available', files }
}

async function readReviewFile(
  file: ReviewFileRef,
  worktrees: readonly Worktree[],
  folders: readonly FolderWorkspace[]
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const worktree = worktrees.find((entry) => entry.id === file.workspaceId)
  const folder = folders.find((entry) => `folder:${entry.id}` === file.workspaceId)
  const root = worktree?.path ?? folder?.folderPath
  if (!root) {
    return { ok: false, error: 'missing-workspace' }
  }
  if (file.source === 'relative-base') {
    return worktree
      ? readBaseVersion(worktree, file.relativePath)
      : { ok: false, error: 'base-unavailable' }
  }
  try {
    const result = await window.api.fs.readFile({ filePath: posixJoin(root, file.relativePath) })
    return result.isBinary ? { ok: false, error: 'binary' } : { ok: true, text: result.content }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'read-failed' }
  }
}

async function readBaseVersion(
  worktree: Worktree,
  relativePath: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!worktree.baseRef) {
    return { ok: false, error: 'base-unavailable' }
  }
  const compared = await window.api.git.branchCompare({
    worktreePath: worktree.path,
    baseRef: worktree.baseRef
  })
  const summary = compared.summary
  if (!summary.baseOid || !summary.headOid || !summary.mergeBase) {
    return { ok: false, error: summary.errorMessage ?? 'base-unavailable' }
  }
  const diff: GitDiffResult = await window.api.git.branchDiff({
    worktreePath: worktree.path,
    compare: {
      baseRef: summary.baseRef,
      baseOid: summary.baseOid,
      headOid: summary.headOid,
      mergeBase: summary.mergeBase
    },
    filePath: relativePath
  })
  if (diff.kind !== 'text') {
    return { ok: false, error: 'binary' }
  }
  return { ok: true, text: diff.originalContent }
}
