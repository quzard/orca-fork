// 未登记时钩子保持上游。登记后只留 SSH/服务器，本地嵌套视图不写停留标记。
import { beforeEach, describe, expect, it } from 'vitest'
import {
  deeperWorkspaceReadOnlyView,
  registerTerminalFileLinkWorkspace,
  retainSshServerLinkInSource,
  terminalFileLinkStay,
  terminalHtmlIsDirectSshOutsideWorktree
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import {
  applyTerminalFileLinkStayStorageEvent,
  forgetClosedTerminalFileLinkStays,
  loadTerminalFileLinkStay,
  nextTerminalFileLinkStayClosures,
  pruneTerminalFileLinkStays,
  rememberTerminalFileLinkStay,
  resetTerminalFileLinkStayCacheForTests,
  saveTerminalFileLinkStay,
  shouldSkipTerminalFileLinkStaySync,
  terminalFileLinkSessionHydrated,
  terminalFileLinkStayKey
} from './file-link-stay'

const remembered: { worktreeId: string; filePath: string }[] = []

function sourceContext(worktreePath: string) {
  return { connectionId: undefined, target: { kind: 'environment' }, worktreePath }
}

describe('terminal file-link workspace hooks', () => {
  it('leaves the owner unchanged until the fork registers', () => {
    const linked = {
      fileContext: sourceContext('/repo'),
      worktreeId: 'folder:home',
      worktreePath: '/Users/me',
      filePath: '/Users/me/a.png',
      stat: { isDirectory: false, escapesWorktree: false },
      hostWorkspaceFile: {
        kind: 'host' as const,
        absolutePath: '/Users/me/a.png',
        worktreeId: 'folder:home',
        worktreePath: '/Users/me',
        executionHostId: 'runtime:env-1' as const,
        isDirectory: false
      },
      hostGrantId: null,
      clientLocal: false
    }
    expect(
      retainSshServerLinkInSource(
        linked,
        { worktreeId: 'wt-feat', worktreePath: '/repo', fileContext: sourceContext('/repo') },
        () => null
      )
    ).toEqual({ owner: linked, view: null })
    expect(
      deeperWorkspaceReadOnlyView('ssh:ssh-1', '/home/me/a.ts', 'wt-ssh', () => null)
    ).toBeNull()
    expect(
      terminalHtmlIsDirectSshOutsideWorktree({
        fileContext: { connectionId: 'ssh-1', target: { kind: 'local' }, worktreePath: '/home/me' },
        mappedFilePath: '/tmp/x.html',
        statResult: { escapesWorktree: true }
      })
    ).toBe(false)
    expect(terminalFileLinkStay('wt-feat', '/Users/me/a.png')).toBe(false)

    registerTerminalFileLinkWorkspace({
      rememberSshStay: (worktreeId, filePath) => {
        remembered.push({ worktreeId, filePath })
      },
      lookupStay: (worktreeId, filePath) =>
        remembered.some((stay) => stay.worktreeId === worktreeId && stay.filePath === filePath)
    })
  })

  it('holds a server file in the clicked workspace and remembers it', () => {
    remembered.length = 0
    const linked = {
      fileContext: sourceContext('/Users/me'),
      worktreeId: 'folder:home',
      worktreePath: '/Users/me',
      filePath: '/Users/me/a.png',
      stat: { isDirectory: false, escapesWorktree: false },
      hostWorkspaceFile: {
        kind: 'host' as const,
        absolutePath: '/Users/me/a.png',
        worktreeId: 'folder:home',
        worktreePath: '/Users/me',
        executionHostId: 'runtime:env-1' as const,
        isDirectory: false
      },
      hostGrantId: null,
      clientLocal: false
    }
    const held = retainSshServerLinkInSource(
      linked,
      { worktreeId: 'wt-feat', worktreePath: '/repo', fileContext: sourceContext('/repo') },
      () => null
    )
    expect(held.owner.worktreeId).toBe('wt-feat')
    expect(held.owner.hostWorkspaceFile?.worktreeId).toBe('folder:home')
    expect(held.view).toEqual({
      worktreeId: 'folder:home',
      relativePath: 'a.png',
      executionHostId: 'runtime:env-1'
    })
    expect(remembered).toEqual([{ worktreeId: 'wt-feat', filePath: '/Users/me/a.png' }])
    expect(terminalFileLinkStay('wt-feat', '/Users/me/a.png')).toBe(true)
  })

  it('returns a local nested view without a stay mark', () => {
    remembered.length = 0
    expect(
      deeperWorkspaceReadOnlyView('local', '/Users/me/nas/x.txt', 'wt-home', () => ({
        worktreeId: 'wt-nas',
        relativePath: 'x.txt',
        executionHostId: 'local'
      }))
    ).toEqual({ worktreeId: 'wt-nas', relativePath: 'x.txt', executionHostId: 'local' })
    expect(remembered).toEqual([])
  })

  it('remembers an SSH nested view', () => {
    remembered.length = 0
    expect(
      deeperWorkspaceReadOnlyView('ssh:ssh-1', '/home/me/nas/x.txt', 'wt-ssh', () => ({
        worktreeId: 'wt-ssh-nas',
        relativePath: 'x.txt',
        executionHostId: 'ssh:ssh-1'
      }))
    ).toEqual({
      worktreeId: 'wt-ssh-nas',
      relativePath: 'x.txt',
      executionHostId: 'ssh:ssh-1'
    })
    expect(remembered).toEqual([{ worktreeId: 'wt-ssh', filePath: '/home/me/nas/x.txt' }])
  })

  it('marks direct SSH html outside the worktree for the in-app preview', () => {
    expect(
      terminalHtmlIsDirectSshOutsideWorktree({
        fileContext: {
          connectionId: 'ssh-1',
          target: { kind: 'local' },
          worktreePath: '/home/me/project'
        },
        mappedFilePath: '/home/me/.answer-me-with-html/pages/x.html',
        statResult: { escapesWorktree: false }
      })
    ).toBe(true)
    expect(
      terminalHtmlIsDirectSshOutsideWorktree({
        fileContext: { connectionId: null, target: { kind: 'local' }, worktreePath: '/Users/me' },
        mappedFilePath: '/Users/me/x.html',
        statResult: { escapesWorktree: false }
      })
    ).toBe(false)
  })
})

describe('terminal file-link stay map', () => {
  const storage = new Map<string, string>()
  const home = { worktreeId: 'folder:home', filePath: '/Users/me/x.html' }
  const local = { worktreeId: 'wt-a', filePath: '/repo/a.ts' }

  beforeEach(() => {
    storage.clear()
    resetTerminalFileLinkStayCacheForTests()
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

  it('remembers a stay across a cache reset and drops it when the tab closes', () => {
    saveTerminalFileLinkStay(home.worktreeId, home.filePath)
    saveTerminalFileLinkStay(local.worktreeId, local.filePath)
    resetTerminalFileLinkStayCacheForTests()

    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(true)
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(true)
    expect(loadTerminalFileLinkStay('wt-a', home.filePath)).toBe(false)

    forgetClosedTerminalFileLinkStays([home], [local])
    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(false)
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(true)
  })

  it('does not mark a tab that stayed editable', () => {
    rememberTerminalFileLinkStay(local.worktreeId, local.filePath, { readOnly: undefined })
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(false)
    rememberTerminalFileLinkStay(local.worktreeId, local.filePath, { readOnly: true })
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(true)
  })

  it('prunes marks that are not open once the session has hydrated', () => {
    saveTerminalFileLinkStay(home.worktreeId, home.filePath)
    saveTerminalFileLinkStay(local.worktreeId, local.filePath)
    pruneTerminalFileLinkStays([local])
    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(false)
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(true)
  })

  it('keeps another tab’s write when this tab saves afterwards', () => {
    saveTerminalFileLinkStay(local.worktreeId, local.filePath)
    const key = 'orca.fork.terminal-file-link-stay'
    const foreign = {
      ...JSON.parse(storage.get(key) ?? '{}'),
      [terminalFileLinkStayKey(home.worktreeId, home.filePath)]: true
    }
    storage.set(key, JSON.stringify(foreign))
    saveTerminalFileLinkStay('wt-b', '/repo/b.ts')
    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(true)
    expect(loadTerminalFileLinkStay('wt-b', '/repo/b.ts')).toBe(true)
  })

  it('applies a storage event from another tab before the next read', () => {
    saveTerminalFileLinkStay(local.worktreeId, local.filePath)
    applyTerminalFileLinkStayStorageEvent(
      'orca.fork.terminal-file-link-stay',
      JSON.stringify({ [terminalFileLinkStayKey(home.worktreeId, home.filePath)]: true })
    )
    expect(loadTerminalFileLinkStay(local.worktreeId, local.filePath)).toBe(false)
    expect(loadTerminalFileLinkStay(home.worktreeId, home.filePath)).toBe(true)
  })

  it('skips a store update that did not replace openFiles before hydration finishes', () => {
    expect(shouldSkipTerminalFileLinkStaySync(true, false, false)).toBe(true)
    expect(shouldSkipTerminalFileLinkStaySync(true, true, false)).toBe(false)
    expect(shouldSkipTerminalFileLinkStaySync(true, true, true)).toBe(true)
    expect(shouldSkipTerminalFileLinkStaySync(false, true, true)).toBe(false)
    expect(terminalFileLinkSessionHydrated(true, false)).toBe(false)
    expect(terminalFileLinkSessionHydrated(true, true)).toBe(true)
  })

  it('keeps a mark a snapshot omits until the next openFiles change still lacks it', () => {
    const home = { worktreeId: 'folder:home', filePath: '/Users/me/x.html' }
    const omitted = nextTerminalFileLinkStayClosures([], [home], [])
    expect(omitted.confirmed).toEqual([])
    expect(omitted.pending).toEqual([home])

    const restored = nextTerminalFileLinkStayClosures(omitted.pending, [], [home])
    expect(restored.confirmed).toEqual([])
    expect(restored.pending).toEqual([])

    const closed = nextTerminalFileLinkStayClosures(omitted.pending, [], [])
    expect(closed.confirmed).toEqual([home])
  })
})
