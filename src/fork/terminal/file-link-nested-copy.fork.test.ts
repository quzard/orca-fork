// 外层已经可写打开时，内层再打开不能留下第二份可写缓冲。标签留在外层，只是改为只读。
import { beforeEach, describe, expect, it } from 'vitest'
import { demoteShallowerWritableCopies } from './file-link-nested-copy'
import { loadTerminalFileLinkStay, resetTerminalFileLinkStayCacheForTests } from './file-link-stay'

const FILE = '/Users/me/nas/x.txt'

type Copy = {
  id: string
  filePath: string
  worktreeId: string
  mode: 'edit'
  readOnly?: true
  isDirty?: boolean
  externalSshTargetId?: string
  runtimeEnvironmentId?: string | null
}

function hostOf(file: Copy): string {
  if (file.externalSshTargetId) {
    return `ssh:${file.externalSshTargetId}`
  }
  if (file.runtimeEnvironmentId) {
    return `runtime:${file.runtimeEnvironmentId}`
  }
  return 'local'
}

function demote(openFiles: Copy[]) {
  return demoteShallowerWritableCopies(openFiles, () => 'wt-nas', hostOf)
}

describe('shallower writable copies', () => {
  const storage = new Map<string, string>()

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

  it('marks the outer tab read-only once the nested workspace has the file open', () => {
    const outer: Copy = { id: 'outer', filePath: FILE, worktreeId: 'wt-home', mode: 'edit' }
    const inner: Copy = { id: 'inner', filePath: FILE, worktreeId: 'wt-nas', mode: 'edit' }

    const next = demote([outer, inner])

    expect(next).toEqual([{ ...outer, readOnly: true }, inner])
    expect(loadTerminalFileLinkStay('wt-home', FILE)).toBe(true)
    expect(loadTerminalFileLinkStay('wt-nas', FILE)).toBe(false)
  })

  it('leaves the outer tab writable until the nested workspace opens the file', () => {
    const outer: Copy = { id: 'outer', filePath: FILE, worktreeId: 'wt-home', mode: 'edit' }

    expect(demote([outer])).toBeNull()
    expect(loadTerminalFileLinkStay('wt-home', FILE)).toBe(false)
  })

  it('demotes an outer SSH or runtime tab without touching the nested one', () => {
    const cases = [{ externalSshTargetId: 'ssh-1' }, { runtimeEnvironmentId: 'env-1' }] as const
    for (const owner of cases) {
      const outer: Copy = {
        id: 'outer',
        filePath: FILE,
        worktreeId: 'wt-home',
        mode: 'edit',
        ...owner
      }
      const inner: Copy = {
        id: 'inner',
        filePath: FILE,
        worktreeId: 'wt-nas',
        mode: 'edit',
        ...owner
      }
      const next = demote([outer, inner])
      expect(next?.map((file) => file.readOnly)).toEqual([true, undefined])
      expect(next?.map((file) => file.id)).toEqual(['outer', 'inner'])
    }
  })

  it('leaves a dirty outer tab writable', () => {
    const outer: Copy = {
      id: 'outer',
      filePath: FILE,
      worktreeId: 'wt-home',
      mode: 'edit',
      isDirty: true
    }
    const inner: Copy = { id: 'inner', filePath: FILE, worktreeId: 'wt-nas', mode: 'edit' }

    expect(demote([outer, inner])).toBeNull()
    expect(loadTerminalFileLinkStay('wt-home', FILE)).toBe(false)
  })

  it('leaves an outer tab writable while it still holds a draft', () => {
    const outer: Copy = { id: 'outer', filePath: FILE, worktreeId: 'wt-home', mode: 'edit' }
    const inner: Copy = { id: 'inner', filePath: FILE, worktreeId: 'wt-nas', mode: 'edit' }

    const next = demoteShallowerWritableCopies(
      [outer, inner],
      () => 'wt-nas',
      hostOf,
      (file) => file.id === 'outer'
    )

    expect(next).toBeNull()
    expect(loadTerminalFileLinkStay('wt-home', FILE)).toBe(false)
  })

  it('demotes the outer tab once its edits are gone', () => {
    const dirty: Copy = {
      id: 'outer',
      filePath: FILE,
      worktreeId: 'wt-home',
      mode: 'edit',
      isDirty: true
    }
    const clean: Copy = { id: 'outer', filePath: FILE, worktreeId: 'wt-home', mode: 'edit' }
    const inner: Copy = { id: 'inner', filePath: FILE, worktreeId: 'wt-nas', mode: 'edit' }

    expect(demote([dirty, inner])).toBeNull()
    expect(demote([clean, inner])).toEqual([{ ...clean, readOnly: true }, inner])
  })

  it('does not demote when the deeper tab is read-only', () => {
    const outer: Copy = { id: 'outer', filePath: FILE, worktreeId: 'wt-home', mode: 'edit' }
    const inner: Copy = {
      id: 'inner',
      filePath: FILE,
      worktreeId: 'wt-nas',
      mode: 'edit',
      readOnly: true
    }

    expect(demote([outer, inner])).toBeNull()
    expect(loadTerminalFileLinkStay('wt-home', FILE)).toBe(false)
  })

  it('does not demote a tab on a different host', () => {
    const outer: Copy = { id: 'outer', filePath: FILE, worktreeId: 'wt-home', mode: 'edit' }
    const inner: Copy = {
      id: 'inner',
      filePath: FILE,
      worktreeId: 'wt-nas',
      mode: 'edit',
      runtimeEnvironmentId: 'env-1'
    }

    expect(demote([outer, inner])).toBeNull()
  })
})
