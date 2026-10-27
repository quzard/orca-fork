// SSH 分区里已经写成绝对路径或 file:// 的 HTML，拉回文档预览。
// 必须是 .tsx：引用渲染进程的 @/ 别名，node 工程只收录 src/fork/**/*.ts。
import { isHtmlFilePath } from '@/components/terminal-pane/local-html-file-destinations'
import { useAppStore } from '@/store'
import { fileUriToFilesystemPath } from '../../shared/file-uri-path'
import {
  lookupTerminalHtmlPreview,
  rememberTerminalHtmlPreview
} from '../../shared/fork-hooks/terminal-html-preview'
import { sshRoutedBrowserHtmlLocation } from './html-preview-open'

type PreviewPage = {
  id: string
  url: string
  docLocation?: unknown
  browserRuntimeEnvironmentId?: string | null
}

type PreviewRecoveryState = {
  browserTabsByWorktree: Record<string, { id: string }[]>
  browserPagesByWorkspace: Record<string, PreviewPage[] | undefined>
}

type PreviewRecovery = { pageId: string; worktreeId: string; filePath: string }

/** 浏览器页或标签的引用没变时不用重扫。其它 store 字段更新很频繁。 */
export function sshRoutedHtmlPreviewInputsChanged(
  previous: PreviewRecoveryState,
  next: PreviewRecoveryState
): boolean {
  return (
    previous.browserPagesByWorkspace !== next.browserPagesByWorkspace ||
    previous.browserTabsByWorktree !== next.browserTabsByWorktree
  )
}

function rememberedHtmlPreview(worktreeId: string, filePath: string): boolean {
  const location = lookupTerminalHtmlPreview(worktreeId, filePath)
  if (!location || location.terminalArtifactGrantId) {
    return false
  }
  if (location.sshPreview === true && location.owner.kind === 'ssh') {
    return true
  }
  // 工作区里的 HTML 记的是运行时文档预览。地址被写成绝对路径时同样拉回。授权预览除外。
  return location.owner.kind === 'runtime'
}

/** 裸路径，或 file://（含百分号编码的中文）还原成绝对路径。其它地址不是这次点开的 HTML。 */
function htmlPathFromBrowserUrl(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed.startsWith('/') && !trimmed.includes('://')) {
    return isHtmlFilePath(trimmed) ? trimmed : null
  }
  if (!trimmed.toLowerCase().startsWith('file:')) {
    return null
  }
  try {
    const path = fileUriToFilesystemPath(new URL(trimmed))
    return path && isHtmlFilePath(path) ? path : null
  } catch {
    return null
  }
}

function listedWorktreePath(worktreeId: string): string | null {
  const state = useAppStore.getState()
  if (typeof state.getKnownWorktreeById === 'function') {
    const known = state.getKnownWorktreeById(worktreeId)
    if (known?.path) {
      return known.path
    }
  }
  const grouped = state.worktreesByRepo
  if (!grouped) {
    return null
  }
  for (const rows of Object.values(grouped)) {
    if (!Array.isArray(rows)) {
      continue
    }
    const row = rows.find((entry) => entry.id === worktreeId)
    if (row?.path) {
      return row.path
    }
  }
  return null
}

/** 文件树等没走过终端钩子的 file://，补上和点击相同的读取记录，后面的扫描才能拉回。 */
function seedUnrememberedSshHtml(state: PreviewRecoveryState): void {
  for (const [worktreeId, tabs] of Object.entries(state.browserTabsByWorktree)) {
    for (const tab of tabs) {
      for (const page of state.browserPagesByWorkspace[tab.id] ?? []) {
        if (page.docLocation || page.browserRuntimeEnvironmentId) {
          continue
        }
        const filePath = htmlPathFromBrowserUrl(page.url)
        if (!filePath || lookupTerminalHtmlPreview(worktreeId, filePath)) {
          continue
        }
        const location = sshRoutedBrowserHtmlLocation(
          worktreeId,
          filePath,
          listedWorktreePath(worktreeId)
        )
        if (location) {
          rememberTerminalHtmlPreview(worktreeId, filePath, location)
        }
      }
    }
  }
}

/**
 * 记下的是文档预览、页面却把绝对路径或 file:// 写进了本地浏览器时，全部拉回文档预览。
 * 已处理的页在扫描里跳过，避免第一个 URL 还没清掉时挡住后面的页。授权预览不在结果里。
 */
export function sshRoutedHtmlPreviewRecoveries(
  state: PreviewRecoveryState,
  skipPageIds?: ReadonlySet<string>
): PreviewRecovery[] {
  const hits: PreviewRecovery[] = []
  for (const [worktreeId, tabs] of Object.entries(state.browserTabsByWorktree)) {
    for (const tab of tabs) {
      for (const page of state.browserPagesByWorkspace[tab.id] ?? []) {
        if (skipPageIds?.has(page.id) || page.docLocation || page.browserRuntimeEnvironmentId) {
          continue
        }
        const filePath = htmlPathFromBrowserUrl(page.url)
        if (!filePath || !rememberedHtmlPreview(worktreeId, filePath)) {
          continue
        }
        hits.push({ pageId: page.id, worktreeId, filePath })
      }
    }
  }
  return hits
}

const recoveredPreviewPages = new Set<string>()

function pullBarePathBackToDocPreview(recovery: PreviewRecovery): void {
  const converted = useAppStore.getState().convertBrowserPage(recovery.pageId, {
    kind: 'workspace-doc',
    docLocation: {
      kind: 'workspace-doc',
      worktreeId: recovery.worktreeId,
      filePath: recovery.filePath
    }
  })
  if (!converted) {
    recoveredPreviewPages.delete(recovery.pageId)
  }
}

/** 裸路径或 file:// 进 SSH 分区后，本机没有这个文件，地址栏留下绝对路径和 ERR_FILE_NOT_FOUND。 */
export function installSshRoutedHtmlPreviewRecovery(): void {
  useAppStore.subscribe((state, previous) => {
    if (previous && !sshRoutedHtmlPreviewInputsChanged(previous, state)) {
      return
    }
    seedUnrememberedSshHtml(state)
    const pending = sshRoutedHtmlPreviewRecoveries(state, recoveredPreviewPages)
    // 转换会同步写 store。先占住全部 id，嵌套扫描才不会把还没轮到的页再转一次。
    for (const recovery of pending) {
      recoveredPreviewPages.add(recovery.pageId)
    }
    for (const recovery of pending) {
      pullBarePathBackToDocPreview(recovery)
    }
  })
}
