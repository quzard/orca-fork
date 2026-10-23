// 本地标签的 id 随恢复顺序在裸路径和 owned id 之间变化。标记按工作区和路径，两种顺序都能对上。
import { beforeEach, describe, expect, it } from 'vitest'
import { buildHydratedEditorSessionState } from '@/store/slices/editor/actions/hydrated-editor-session-state'
import { buildOwnedEditorFileId } from '@/store/slices/editor/file-ids/editor-file-ids'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import {
  registerTerminalFileLinkWorkspace,
  terminalFileLinkStay
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import {
  loadTerminalFileLinkStay,
  resetTerminalFileLinkStayCacheForTests,
  saveTerminalFileLinkStay
} from './file-link-stay'

const PATH = '/Users/me/x.html'
const A = 'wt-a'
const B = 'folder:home'

function session(first: string, second: string): WorkspaceSessionState {
  const file = (worktreeId: string) => ({
    filePath: PATH,
    relativePath: PATH,
    worktreeId,
    language: 'plaintext'
  })
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    openFilesByWorktree: {
      [first]: [file(first)],
      [second]: [file(second)]
    }
  }
}

describe('terminal file-link stay survives hydration order', () => {
  const storage = new Map<string, string>()
  let keep = true

  beforeEach(() => {
    storage.clear()
    resetTerminalFileLinkStayCacheForTests()
    keep = true
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        }
      }
    })
    registerTerminalFileLinkWorkspace({
      keepsCurrentWorkspace: () => keep,
      renderSetting: () => null,
      searchEntries: () => [],
      lookupStay: loadTerminalFileLinkStay
    })
  })

  it('still matches workspace A when B hydrates first and A gets an owned id', () => {
    const { state } = buildHydratedEditorSessionState(session(B, A), new Set([A, B]), null)
    const a = state.openFiles.find((file) => file.worktreeId === A)
    const b = state.openFiles.find((file) => file.worktreeId === B)
    expect(b?.id).toBe(PATH)
    expect(a?.id).toBe(buildOwnedEditorFileId(PATH, A, null))

    saveTerminalFileLinkStay(A, PATH)
    expect(terminalFileLinkStay(A, PATH)).toBe(true)
    keep = false
    expect(terminalFileLinkStay(A, PATH)).toBe(false)
  })

  it('still matches workspace A when A hydrates first under the bare path', () => {
    const { state } = buildHydratedEditorSessionState(session(A, B), new Set([A, B]), null)
    const a = state.openFiles.find((file) => file.worktreeId === A)
    const b = state.openFiles.find((file) => file.worktreeId === B)
    expect(a?.id).toBe(PATH)
    expect(b?.id).toBe(buildOwnedEditorFileId(PATH, B, null))

    saveTerminalFileLinkStay(A, PATH)
    expect(terminalFileLinkStay(A, PATH)).toBe(true)
    expect(terminalFileLinkStay(B, PATH)).toBe(false)
  })
})
