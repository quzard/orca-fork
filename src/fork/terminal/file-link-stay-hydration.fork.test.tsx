// 启动失败会把 workspaceSessionReady 设上，但 hydrationSucceeded 仍是 false，不能把标记清掉。
import { beforeEach, describe, expect, it, vi } from 'vitest'

type StayFile = {
  id: string
  worktreeId: string
  filePath: string
  mode?: 'edit'
  readOnly?: true
  isDirty?: boolean
}
type StayState = {
  openFiles: StayFile[]
  workspaceSessionReady: boolean
  hydrationSucceeded: boolean
  settings: object
  worktreesByRepo?: object
  folderWorkspaces?: unknown[]
}

const listeners = new Set<(state: StayState) => void>()
let state: StayState

function setState(partial: Partial<StayState>): void {
  state = { ...state, ...partial }
  for (const listener of listeners) {
    listener(state)
  }
}

const findRoute = vi.hoisted(() => vi.fn())

vi.mock('@/lib/runtime-workspace-file-route', () => ({
  findWorkspaceFileRoute: findRoute
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => state,
    setState: (partial: Partial<StayState>) => setState(partial),
    subscribe: (listener: (next: StayState) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}))

vi.mock('@/components/settings/SearchableSetting', () => ({
  SearchableSetting: () => null
}))

vi.mock('@/components/settings/SettingsFormControls', () => ({
  SettingsSwitchRow: () => null
}))

import {
  registerTerminalFileLinkStayWatch,
  resetTerminalFileLinkWorkspaceWatchForTests
} from './file-link-stay-watch'
import {
  loadTerminalFileLinkStay,
  resetTerminalFileLinkStayCacheForTests,
  saveTerminalFileLinkStay
} from './file-link-stay'

const PATH = '/Users/me/x.html'
const WORKTREE = 'wt-a'

describe('terminal file-link stay hydration', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    resetTerminalFileLinkStayCacheForTests()
    resetTerminalFileLinkWorkspaceWatchForTests()
    listeners.clear()
    findRoute.mockReset()
    findRoute.mockReturnValue(null)
    state = {
      openFiles: [],
      workspaceSessionReady: false,
      hydrationSucceeded: false,
      settings: {}
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        }
      }
    })
  })

  it('does not prune when a degraded startup is ready with no files, and waits out a snapshot gap', () => {
    saveTerminalFileLinkStay(WORKTREE, PATH)
    registerTerminalFileLinkStayWatch()

    setState({
      workspaceSessionReady: true,
      hydrationSucceeded: false,
      openFiles: []
    })
    expect(loadTerminalFileLinkStay(WORKTREE, PATH)).toBe(true)

    const kept = { id: 'owned', worktreeId: WORKTREE, filePath: PATH }
    setState({ hydrationSucceeded: true, openFiles: [kept] })
    expect(loadTerminalFileLinkStay(WORKTREE, PATH)).toBe(true)

    setState({ openFiles: [] })
    expect(loadTerminalFileLinkStay(WORKTREE, PATH)).toBe(true)

    setState({ openFiles: [{ id: 'other', worktreeId: 'wt-b', filePath: '/repo/b.ts' }] })
    expect(loadTerminalFileLinkStay(WORKTREE, PATH)).toBe(false)
  })

  it('demotes an older writable outer tab when the nested workspace opens the same path', () => {
    registerTerminalFileLinkStayWatch()
    findRoute.mockReturnValue({
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local'
    })
    const filePath = '/Users/me/nas/x.txt'

    setState({
      worktreesByRepo: {},
      folderWorkspaces: [],
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit' }
      ]
    })

    expect(state.openFiles.map((file) => [file.id, file.readOnly])).toEqual([
      ['outer', true],
      ['inner', undefined]
    ])
    expect(loadTerminalFileLinkStay('wt-home', filePath)).toBe(false)
    expect(loadTerminalFileLinkStay('wt-nas', filePath)).toBe(false)
  })

  it('waits to demote a dirty outer tab until the edits are gone', () => {
    registerTerminalFileLinkStayWatch()
    findRoute.mockReturnValue({
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local'
    })
    const filePath = '/Users/me/nas/x.txt'
    const inner = { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit' as const }

    setState({
      worktreesByRepo: {},
      folderWorkspaces: [],
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit', isDirty: true },
        inner
      ]
    })
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBeUndefined()

    setState({
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit', isDirty: false },
        inner
      ]
    })
    expect(state.openFiles.map((file) => [file.id, file.readOnly])).toEqual([
      ['outer', true],
      ['inner', undefined]
    ])
  })

  it('does not demote when the nested tab is read-only', () => {
    registerTerminalFileLinkStayWatch()
    findRoute.mockReturnValue({
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local'
    })
    const filePath = '/Users/me/nas/x.txt'

    setState({
      worktreesByRepo: {},
      folderWorkspaces: [],
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit', readOnly: true }
      ]
    })

    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBeUndefined()
    expect(loadTerminalFileLinkStay('wt-home', filePath)).toBe(false)
  })

  it('looks up only the path that changed', () => {
    registerTerminalFileLinkStayWatch()
    const nested = '/Users/me/nas/x.txt'
    const other = '/Users/me/other.txt'
    findRoute.mockImplementation((_state, _host, filePath: string) =>
      filePath === nested
        ? { worktreeId: 'wt-nas', relativePath: 'x.txt', executionHostId: 'local' }
        : { worktreeId: 'wt-home', relativePath: 'other.txt', executionHostId: 'local' }
    )
    setState({
      worktreesByRepo: {},
      folderWorkspaces: [],
      openFiles: [
        { id: 'other', worktreeId: 'wt-home', filePath: other, mode: 'edit' },
        { id: 'outer', worktreeId: 'wt-home', filePath: nested, mode: 'edit' }
      ]
    })
    findRoute.mockClear()

    setState({
      openFiles: [
        { id: 'other', worktreeId: 'wt-home', filePath: other, mode: 'edit' },
        { id: 'outer', worktreeId: 'wt-home', filePath: nested, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath: nested, mode: 'edit' }
      ]
    })

    const paths = findRoute.mock.calls.map((call) => call[2])
    expect(paths).toContain(nested)
    expect(paths).not.toContain(other)
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBe(true)
  })

  it('demotes both copies when the workspace list arrives after they are open', () => {
    registerTerminalFileLinkStayWatch()
    const filePath = '/Users/me/nas/x.txt'
    const route = { worktreeId: 'wt-nas', relativePath: 'x.txt', executionHostId: 'local' }
    findRoute.mockReturnValue(route)
    setState({
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit' }
      ]
    })
    expect(findRoute).not.toHaveBeenCalled()
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBeUndefined()

    setState({ worktreesByRepo: { 'repo-ssh': [] } })

    expect(findRoute).toHaveBeenCalled()
    expect(state.openFiles.map((file) => [file.id, file.readOnly])).toEqual([
      ['outer', true],
      ['inner', undefined]
    ])
    expect(loadTerminalFileLinkStay('wt-home', filePath)).toBe(false)
  })

  it('demotes both copies when only the folder workspace list arrives late', () => {
    registerTerminalFileLinkStayWatch()
    const filePath = '/Users/me/nas/x.txt'
    findRoute.mockReturnValue({
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local'
    })
    setState({
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit' }
      ]
    })
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBeUndefined()

    setState({ folderWorkspaces: [] })

    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBe(true)
  })

  it('keeps a dirty outer tab writable when the workspace list arrives, then demotes it once clean', () => {
    registerTerminalFileLinkStayWatch()
    const filePath = '/Users/me/nas/x.txt'
    const inner = { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit' as const }
    findRoute.mockReturnValue({
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local'
    })
    setState({
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit', isDirty: true },
        inner
      ]
    })
    setState({ worktreesByRepo: {}, folderWorkspaces: [] })
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBeUndefined()

    setState({
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit', isDirty: false },
        inner
      ]
    })
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBe(true)
  })

  it('demotes both writable copies once the workspace catalog arrives', () => {
    registerTerminalFileLinkStayWatch()
    const filePath = '/Users/me/nas/x.txt'
    const other = '/Users/me/other.txt'
    findRoute.mockImplementation((_state, _host, path: string) =>
      path === filePath
        ? { worktreeId: 'wt-nas', relativePath: 'x.txt', executionHostId: 'local' }
        : { worktreeId: 'wt-home', relativePath: 'other.txt', executionHostId: 'local' }
    )
    setState({
      openFiles: [
        { id: 'other', worktreeId: 'wt-home', filePath: other, mode: 'edit' },
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit' }
      ]
    })
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBeUndefined()
    findRoute.mockClear()

    setState({ worktreesByRepo: {}, folderWorkspaces: [] })

    const paths = findRoute.mock.calls.map((call) => call[2])
    expect(paths).toContain(filePath)
    expect(paths).toContain(other)
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBe(true)
    expect(state.openFiles.find((file) => file.id === 'inner')?.readOnly).toBeUndefined()
    expect(state.openFiles.find((file) => file.id === 'other')?.readOnly).toBeUndefined()
  })

  it('forgets a marked tab closed in the same update that demotes another tab', () => {
    const markedPath = '/Users/me/kept.html'
    const nested = '/Users/me/nas/x.txt'
    saveTerminalFileLinkStay('wt-marked', markedPath)
    registerTerminalFileLinkStayWatch()
    findRoute.mockReturnValue({
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local'
    })
    setState({
      workspaceSessionReady: true,
      hydrationSucceeded: true,
      worktreesByRepo: {},
      folderWorkspaces: [],
      openFiles: [
        {
          id: 'marked',
          worktreeId: 'wt-marked',
          filePath: markedPath,
          mode: 'edit',
          readOnly: true
        },
        { id: 'outer', worktreeId: 'wt-home', filePath: nested, mode: 'edit' }
      ]
    })
    expect(loadTerminalFileLinkStay('wt-marked', markedPath)).toBe(true)

    setState({
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath: nested, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath: nested, mode: 'edit' }
      ]
    })
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBe(true)
    expect(loadTerminalFileLinkStay('wt-marked', markedPath)).toBe(true)
    expect(loadTerminalFileLinkStay('wt-home', nested)).toBe(false)

    setState({
      openFiles: [
        ...state.openFiles,
        { id: 'other', worktreeId: 'wt-b', filePath: '/repo/b.ts', mode: 'edit' }
      ]
    })
    expect(loadTerminalFileLinkStay('wt-marked', markedPath)).toBe(false)
    expect(loadTerminalFileLinkStay('wt-home', nested)).toBe(false)
  })

  it('retries a path whose owner was unknown when another tab changes', () => {
    registerTerminalFileLinkStayWatch()
    const filePath = '/Users/me/nas/x.txt'
    const other = '/Users/me/other.txt'
    findRoute.mockReturnValue(null)
    setState({ worktreesByRepo: {}, folderWorkspaces: [] })
    setState({
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit' }
      ]
    })
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBeUndefined()

    findRoute.mockReturnValue({
      worktreeId: 'wt-nas',
      relativePath: 'x.txt',
      executionHostId: 'local'
    })
    findRoute.mockClear()
    setState({
      openFiles: [
        { id: 'outer', worktreeId: 'wt-home', filePath, mode: 'edit' },
        { id: 'inner', worktreeId: 'wt-nas', filePath, mode: 'edit' },
        { id: 'extra', worktreeId: 'wt-home', filePath: other, mode: 'edit' }
      ]
    })

    const paths = findRoute.mock.calls.map((call) => call[2])
    expect(paths).toContain(filePath)
    expect(state.openFiles.find((file) => file.id === 'outer')?.readOnly).toBe(true)
    expect(state.openFiles.find((file) => file.id === 'inner')?.readOnly).toBeUndefined()
  })
})
