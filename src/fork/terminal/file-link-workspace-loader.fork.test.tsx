// @vitest-environment happy-dom
// 第三条切工作区路径在编辑器读文件时：绝对路径被认领到更宽的根（例如家目录）并激活它。
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import { registerTerminalFileLinkWorkspace } from '../../shared/fork-hooks/terminal-file-link-workspace'
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

const stays = new Set<string>()

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
    requireRuntimeTargetForFileOwner: (
      _state: unknown,
      _worktreeId: unknown,
      runtimeEnvironmentId?: string | null
    ) =>
      runtimeEnvironmentId
        ? { kind: 'environment' as const, environmentId: runtimeEnvironmentId }
        : local,
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
  let loadError: string | undefined

  beforeEach(() => {
    stays.clear()
    registerTerminalFileLinkWorkspace({
      rememberSshStay: () => undefined,
      lookupStay: (worktreeId, path) => stays.has(`${worktreeId}\0${path}`)
    })
    openFiles = []
    loadError = undefined
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
        setFileContents: (update) => {
          if (typeof update !== 'function') {
            return
          }
          const next = update({})
          loadError = Object.values(next).find((value) => value.loadError)?.loadError
        }
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
    stays.add(`${SOURCE}\0${HOME_FILE}`)
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

  it('reads a local read-only tab on this computer even when a stay mark exists', async () => {
    const tab = externalTab({ readOnly: true })
    stays.add(`${SOURCE}\0${HOME_FILE}`)
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

  it('uses the upstream external-file error when the owning workspace is gone', async () => {
    const tab = externalTab({ readOnly: true, runtimeEnvironmentId: 'env-1' })
    stays.add(`${SOURCE}\0${HOME_FILE}`)
    mocks.findWorkspaceFileRoute.mockReturnValue(null)
    openFiles = [tab]

    await act(async () => load!(HOME_FILE, tab.id, SOURCE, HOME_FILE))

    expect(mocks.migrateRestoredEditorFileOwner).not.toHaveBeenCalled()
    expect(mocks.readEditorCsvFileContent).not.toHaveBeenCalled()
    expect(loadError).toBe('External local files are not available for remote workspaces.')
  })

  it('keeps a marked local tab in place and still reads its absolute path', async () => {
    const tab = externalTab()
    stays.add(`${SOURCE}\0${HOME_FILE}`)
    mocks.findWorkspaceFileRoute.mockReturnValue(null)
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
