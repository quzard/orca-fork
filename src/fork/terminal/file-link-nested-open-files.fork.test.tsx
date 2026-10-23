// 另一个工作区打开同一路径时，这边已有的标签还在。上游按工作区区分文件 id，不会按路径合并。
import { describe, expect, it, vi } from 'vitest'
import { createEditorStore } from '@/store/slices/editor-slice-test-harness'

vi.mock('sonner', () => ({
  toast: { error: vi.fn() }
}))

vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: vi.fn()
}))

const FILE = '/Users/me/nas/x.txt'

function open(
  store: ReturnType<typeof createEditorStore>,
  worktreeId: string,
  relativePath: string,
  readOnly?: true
): void {
  store.getState().openFile(
    {
      filePath: FILE,
      relativePath,
      worktreeId,
      language: 'plaintext',
      mode: 'edit',
      runtimeEnvironmentId: null,
      ...(readOnly ? { readOnly } : {})
    },
    { preview: false, suppressActiveRuntimeFallback: true }
  )
}

describe('nested file tabs stay in their own workspaces', () => {
  it('keeps the read-only tab after the same path opens writable in another workspace', () => {
    const store = createEditorStore()
    open(store, 'wt-nas', FILE, true)
    open(store, 'wt-home', 'nas/x.txt')

    const files = store.getState().openFiles
    expect(files).toHaveLength(2)
    expect(files.find((file) => file.worktreeId === 'wt-nas')).toEqual(
      expect.objectContaining({ filePath: FILE, readOnly: true })
    )
    expect(files.find((file) => file.worktreeId === 'wt-home')).toEqual(
      expect.objectContaining({ filePath: FILE, relativePath: 'nas/x.txt' })
    )
    expect(files.find((file) => file.worktreeId === 'wt-home')?.readOnly).toBeUndefined()
  })

  it('keeps the older writable tab when the nested workspace opens the same path', () => {
    const store = createEditorStore()
    open(store, 'wt-home', 'nas/x.txt')
    open(store, 'wt-nas', 'x.txt')

    const files = store.getState().openFiles
    expect(files).toHaveLength(2)
    expect(files.map((file) => file.worktreeId).sort()).toEqual(['wt-home', 'wt-nas'])
  })
})
