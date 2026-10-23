// @vitest-environment happy-dom
// 第三条切工作区路径在编辑器读文件时：绝对路径被认领到更宽的根（例如家目录）并激活它。
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import {
  registerTerminalFileLinkWorkspace,
  type TerminalFileLinkStay
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import {
  useEditorPanelFileContentLoader,
  type EditorPanelFileContentLoader
} from '@/components/editor/useEditorPanelFileContentLoader'

const mocks = vi.hoisted(() => ({
  findWorkspaceFileRoute: vi.fn(),
  migrateRestoredEditorFileOwner: vi.fn(),
  readEditorCsvFileContent: vi.fn(),
  findRestoredEditorWorkspaceRuntimeOwner: vi.fn(),
  getState: vi.fn()
}))

const stays = new Map<string, TerminalFileLinkStay>()

vi.mock('@/lib/connection-context', () => ({
  getConnectionIdForFile: vi.fn(() => null),
  isWorktreeConnectionResolved: vi.fn(() => true)
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (select: (state: ReturnType<typeof mocks.getState>) => unknown) => select(mocks.getState()),
    { getState: mocks.getState }
  )
}))

vi.mock('@/lib/file-owner-runtime-target', () => {
  const local = { kind: 'local' as const }
  return {
    getRuntimeTargetForFileOwner: () => local,
    requireRuntimeTargetForFileOwner: () => local,
    getRuntimeTargetForWorktreeOwner: () => local
  }
})

vi.mock('@/lib/runtime-workspace-file-route', () => ({
  findWorkspaceFileRoute: mocks.findWorkspaceFileRoute
}))

vi.mock('@/components/editor/migrate-restored-editor-file-owner', () => ({
  migrateRestoredEditorFileOwner: mocks.migrateRestoredEditorFileOwner
}))

vi.mock('@/components/editor/restored-editor-workspace-runtime-owner', () => ({
  findRestoredEditorWorkspaceRuntimeOwner: mocks.findRestoredEditorWorkspaceRuntimeOwner
}))

vi.mock('@/components/editor/csv/csv-file-content', () => ({
  readEditorCsvFileContent: mocks.readEditorCsvFileContent
}))

vi.mock('@/lib/worktree-host-connection-phase', () => ({
  selectWorktreeHostConnectionPhase: () => ({ phase: 'local', targetId: null })
}))

const SOURCE = 'wt-ha'
const HOME = 'folder:home'
const HOME_FILE = '/Users/me/Library/Application Support/orca/generated.png'
const HOME_ROUTE = {
  worktreeId: HOME,
  relativePath: 'Library/Application Support/orca/generated.png',
  executionHostId: 'local'
} as const

function externalTab(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: HOME_FILE,
    filePath: HOME_FILE,
    relativePath: HOME_FILE,
    worktreeId: SOURCE,
    language: 'plaintext',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

describe('editor load of a terminal file link', () => {
  let container: HTMLDivElement
  let root: Root
  let load: EditorPanelFileContentLoader | null
  let openFiles: OpenFile[]

  beforeEach(() => {
    stays.clear()
    registerTerminalFileLinkWorkspace({
      keepsCurrentWorkspace: () => true,
      renderSetting: () => null,
      searchEntries: () => [],
      lookupStay: (fileId) => stays.get(fileId) ?? null
    })
    openFiles = []
    load = null
    mocks.findWorkspaceFileRoute.mockReset()
    mocks.findWorkspaceFileRoute.mockReturnValue(HOME_ROUTE)
    mocks.migrateRestoredEditorFileOwner.mockReset()
    mocks.migrateRestoredEditorFileOwner.mockResolvedValue({ ok: true, fileId: 'owned' })
    mocks.readEditorCsvFileContent.mockReset()
    mocks.readEditorCsvFileContent.mockResolvedValue({ content: '', isBinary: true })
    mocks.findRestoredEditorWorkspaceRuntimeOwner.mockReset()
    mocks.findRestoredEditorWorkspaceRuntimeOwner.mockReturnValue(null)
    mocks.getState.mockReset()
    mocks.getState.mockReturnValue({
      settings: {},
      openFiles: [],
      editorDrafts: {},
      setCsvPreviewOnly: vi.fn()
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    function LoaderHarness(): null {
      load = useEditorPanelFileContentLoader({
        fileLoadRetryAttemptsRef: { current: {} },
        fileReadGenerationCounterRef: { current: 0 },
        fileReadGenerationRef: { current: {} },
        openFilesRef: {
          get current() {
            return openFiles
          }
        },
        outstandingFileReadsRef: { current: {} },
        setFileContents: () => {}
      })
      return null
    }
    act(() => root.render(<LoaderHarness />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('still reparents an unmarked absolute path onto the workspace that contains it', async () => {
    const tab = externalTab()
    openFiles = [tab]

    await act(async () => load!(HOME_FILE, tab.id, SOURCE, HOME_FILE))

    expect(mocks.migrateRestoredEditorFileOwner).toHaveBeenCalledWith(tab.id, HOME_ROUTE, null)
    expect(mocks.readEditorCsvFileContent).not.toHaveBeenCalled()
  })

  it('reads a restored terminal link from the host workspace without reparenting', async () => {
    const tab = externalTab({
      id: 'editor:wt-ha:env-1:generated.png',
      readOnly: true,
      runtimeEnvironmentId: 'env-1'
    })
    stays.set(tab.id, { read: { worktreeId: HOME, relativePath: HOME_ROUTE.relativePath } })
    openFiles = [tab]

    await act(async () => load!(HOME_FILE, tab.id, SOURCE, HOME_FILE))

    expect(mocks.migrateRestoredEditorFileOwner).not.toHaveBeenCalled()
    expect(mocks.readEditorCsvFileContent).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: HOME_FILE,
        relativePath: HOME_ROUTE.relativePath,
        worktreeId: HOME,
        terminalArtifactGrantId: undefined
      }),
      expect.anything()
    )
  })

  it('keeps a marked local tab in place and still reads its absolute path', async () => {
    const tab = externalTab()
    stays.set(tab.id, { read: null })
    openFiles = [tab]

    await act(async () => load!(HOME_FILE, tab.id, SOURCE, HOME_FILE))

    expect(mocks.migrateRestoredEditorFileOwner).not.toHaveBeenCalled()
    expect(mocks.readEditorCsvFileContent).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: HOME_FILE,
        relativePath: HOME_FILE,
        worktreeId: SOURCE
      }),
      expect.anything()
    )
  })
})
