// @vitest-environment happy-dom
// End to end in the renderer: a preview opened from a host-granted source tab (a paired-server
// terminal link outside every workspace) loads through the grant instead of being refused as an
// external local file.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { FileContent } from '../../renderer/src/components/editor/editor-panel-content-types'
import { createEditorStore } from '../../renderer/src/store/slices/editor-slice-test-harness'
import { registerMarkdownPreviewSourceFields } from '../../shared/fork-hooks/markdown-preview-source-fields'
import { registerMarkdownPreviewGrant } from './markdown-preview-grant'

const mocks = vi.hoisted(() => ({
  readRuntimeFileContent: vi.fn(),
  getState: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: vi.fn()
}))
vi.mock('@/runtime/runtime-file-routing', () => ({
  getRuntimeFileReadScope: vi.fn(
    (
      target: { kind: 'local' } | { kind: 'environment'; environmentId: string },
      connectionId?: string
    ) => connectionId ?? (target.kind === 'environment' ? target.environmentId : null)
  )
}))
vi.mock('@/runtime/runtime-file-read-client', () => ({
  readRuntimeFileContent: mocks.readRuntimeFileContent
}))
vi.mock('@/runtime/runtime-file-watch-client', () => ({ subscribeRuntimeFileChanges: vi.fn() }))
vi.mock('@/runtime/runtime-git-diff-client', () => ({
  getRuntimeGitBranchDiff: vi.fn(),
  getRuntimeGitCommitDiff: vi.fn(),
  getRuntimeGitDiff: vi.fn()
}))
vi.mock('@/runtime/runtime-git-client-context', () => ({ getRuntimeGitScope: vi.fn(() => null) }))
vi.mock('@/lib/connection-context', () => ({
  getConnectionId: vi.fn(() => undefined),
  getConnectionIdForFile: vi.fn(() => undefined),
  isWorktreeConnectionResolved: vi.fn(() => true)
}))
vi.mock(
  '@/lib/worktree-host-connection-phase',
  () => import('../../renderer/src/components/editor/local-host-test-fixture')
)
vi.mock('@/lib/runtime-workspace-file-route', () => ({
  findWorkspaceFileRoute: vi.fn(() => null)
}))
// `repo-runtime::` workspaces live on runtime-1.
vi.mock('@/lib/file-owner-runtime-target', () => {
  const ownerTarget = (_s: unknown, worktreeId?: string, owner?: string | null) => {
    const id = owner === undefined && worktreeId?.startsWith('repo-runtime::') ? 'runtime-1' : owner
    return id ? { kind: 'environment', environmentId: id } : { kind: 'local' }
  }
  return {
    getRuntimeTargetForFileOwner: ownerTarget,
    requireRuntimeTargetForFileOwner: ownerTarget
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState } }))

import { useEditorPanelContentState } from '../../renderer/src/components/editor/useEditorPanelContentState'

const FILE_PATH = '/tmp/satlc/fix-round6/brief.md'
const WORKTREE_ID = 'repo-runtime::/work/lite-lifecycle'
const REMOTE_REFUSAL = 'External local files are not available for remote workspaces.'

let latestFileContents: Record<string, FileContent> = {}

function HookProbe({ activeFile, openFiles }: { activeFile: OpenFile; openFiles: OpenFile[] }) {
  latestFileContents = useEditorPanelContentState({
    activeFile,
    isChangesMode: false,
    openFiles,
    gitStatusEntries: undefined,
    editorViewMode: {}
  }).fileContents
  return null
}

/** Opens the granted source tab the terminal link creates, then its markdown preview. */
function openGrantedPreview(): { preview: OpenFile; openFiles: OpenFile[] } {
  const store = createEditorStore()
  store.getState().openFile({
    filePath: FILE_PATH,
    relativePath: FILE_PATH,
    worktreeId: WORKTREE_ID,
    language: 'markdown',
    mode: 'edit',
    runtimeEnvironmentId: 'runtime-1',
    readOnly: true,
    terminalArtifactGrantId: 'grant-1'
  })
  const source = store.getState().openFiles[0]
  store.getState().openMarkdownPreview(
    {
      filePath: FILE_PATH,
      relativePath: FILE_PATH,
      worktreeId: WORKTREE_ID,
      runtimeEnvironmentId: source.runtimeEnvironmentId,
      language: 'markdown'
    },
    { sourceFileId: source.id }
  )
  const openFiles = store.getState().openFiles
  const preview = openFiles.find((file) => file.mode === 'markdown-preview')
  if (!preview) {
    throw new Error('preview tab missing')
  }
  return { preview, openFiles }
}

describe('markdown preview of a host-granted remote file', () => {
  let root: Root | null = null

  beforeEach(() => {
    latestFileContents = {}
    ;(window as unknown as { api: unknown }).api = {
      fs: { onLocalLogTailChanged: vi.fn(() => () => {}) }
    }
    mocks.readRuntimeFileContent.mockReset()
    mocks.readRuntimeFileContent.mockResolvedValue({ content: '# brief', isBinary: false })
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    registerMarkdownPreviewSourceFields(undefined)
  })

  async function load(preview: OpenFile, openFiles: OpenFile[]): Promise<void> {
    mocks.getState.mockReturnValue({
      settings: { activeRuntimeEnvironmentId: 'runtime-1' },
      openFiles,
      editorDrafts: {},
      setLastKnownDiskSignature: vi.fn(),
      setCsvPreviewOnly: vi.fn()
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<HookProbe activeFile={preview} openFiles={openFiles} />)
    })
  }

  it('reads the preview through the source grant and does not refuse it', async () => {
    registerMarkdownPreviewGrant()
    const { preview, openFiles } = openGrantedPreview()
    await load(preview, openFiles)

    await vi.waitFor(() => expect(latestFileContents[preview.id]?.content).toBe('# brief'))
    expect(latestFileContents[preview.id]?.loadError).toBeUndefined()
    expect(mocks.readRuntimeFileContent).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'environment', environmentId: 'runtime-1' },
        filePath: FILE_PATH,
        worktreeId: WORKTREE_ID,
        terminalArtifactGrantId: 'grant-1'
      })
    )
  })

  it('unregistered (upstream), the same preview is refused as an external local file', async () => {
    const { preview, openFiles } = openGrantedPreview()
    await load(preview, openFiles)

    await vi.waitFor(() => expect(latestFileContents[preview.id]?.loadError).toBe(REMOTE_REFUSAL))
    expect(mocks.readRuntimeFileContent).not.toHaveBeenCalled()
  })
})
