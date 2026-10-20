import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../../renderer/src/store/types'
import type { StoreApi } from 'zustand/vanilla'
import { createEditorStore } from '../../renderer/src/store/slices/editor-slice-test-harness'
import { registerMarkdownPreviewSourceFields } from '../../shared/fork-hooks/markdown-preview-source-fields'
import { registerMarkdownPreviewGrant } from './markdown-preview-grant'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: vi.fn()
}))

const FILE_PATH = '/tmp/satlc/fix-round6/brief.md'
const WORKTREE_ID = 'repo-runtime::/work/lite-lifecycle'

function openSource(store: StoreApi<AppState>, grantId?: string): string {
  store.getState().openFile({
    filePath: FILE_PATH,
    relativePath: FILE_PATH,
    worktreeId: WORKTREE_ID,
    language: 'markdown',
    mode: 'edit',
    runtimeEnvironmentId: 'runtime-1',
    readOnly: true,
    ...(grantId ? { terminalArtifactGrantId: grantId } : {})
  })
  const source = store.getState().openFiles.find((file) => file.mode === 'edit')
  if (!source) {
    throw new Error('source tab missing')
  }
  return source.id
}

function openPreview(store: StoreApi<AppState>, sourceFileId: string): void {
  store.getState().openMarkdownPreview(
    {
      filePath: FILE_PATH,
      relativePath: FILE_PATH,
      worktreeId: WORKTREE_ID,
      runtimeEnvironmentId: 'runtime-1',
      language: 'markdown'
    },
    { sourceFileId }
  )
}

function previewOf(store: StoreApi<AppState>) {
  return store.getState().openFiles.find((file) => file.mode === 'markdown-preview')
}

describe('markdown preview of a host-granted file', () => {
  afterEach(() => {
    registerMarkdownPreviewSourceFields(undefined)
  })

  describe('with the fork hook registered', () => {
    beforeEach(() => {
      registerMarkdownPreviewGrant()
    })

    it('a new preview tab reads through the source tab grant, read-only', () => {
      const store = createEditorStore()
      const sourceId = openSource(store, 'grant-1')
      openPreview(store, sourceId)

      expect(previewOf(store)).toEqual(
        expect.objectContaining({
          id: `markdown-preview::${sourceId}`,
          markdownPreviewSourceFileId: sourceId,
          runtimeEnvironmentId: 'runtime-1',
          terminalArtifactGrantId: 'grant-1',
          readOnly: true
        })
      )
    })

    it('an existing preview tab picks up the grant the source tab gained', () => {
      const store = createEditorStore()
      const sourceId = openSource(store)
      openPreview(store, sourceId)
      expect(previewOf(store)?.terminalArtifactGrantId).toBeUndefined()

      // A new terminal click mints a fresh grant on the same tab.
      expect(openSource(store, 'grant-2')).toBe(sourceId)
      openPreview(store, sourceId)

      expect(store.getState().openFiles.filter((f) => f.mode === 'markdown-preview')).toHaveLength(
        1
      )
      expect(previewOf(store)).toEqual(
        expect.objectContaining({ terminalArtifactGrantId: 'grant-2', readOnly: true })
      )
    })

    it('a preview of an ungranted file gains no grant and stays editable-owned', () => {
      const store = createEditorStore()
      store.getState().openFile({
        filePath: '/repo/docs/README.md',
        relativePath: 'docs/README.md',
        worktreeId: 'wt-1',
        language: 'markdown',
        mode: 'edit'
      })
      store.getState().openMarkdownPreview(
        {
          filePath: '/repo/docs/README.md',
          relativePath: 'docs/README.md',
          worktreeId: 'wt-1',
          language: 'markdown'
        },
        { sourceFileId: '/repo/docs/README.md' }
      )

      const preview = previewOf(store)
      expect(preview).toBeDefined()
      expect(preview).not.toHaveProperty('terminalArtifactGrantId')
      expect(preview).not.toHaveProperty('readOnly')
    })
  })

  it('unregistered, the preview keeps upstream fields (no grant)', () => {
    const store = createEditorStore()
    const sourceId = openSource(store, 'grant-1')
    openPreview(store, sourceId)

    const preview = previewOf(store)
    expect(preview).toBeDefined()
    expect(preview).not.toHaveProperty('terminalArtifactGrantId')
    expect(preview).not.toHaveProperty('readOnly')
  })
})
