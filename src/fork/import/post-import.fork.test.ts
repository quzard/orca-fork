import { describe, expect, it, afterEach } from 'vitest'
import {
  registerImportedWorktreePath,
  resetImportedWorktreePathForTests,
  stampImportedWorktreePath
} from '../../shared/fork-hooks/imported-worktree-path'
import { nestedHandoff } from './nested-import-context'
import { parentFolderImportRequested } from './parent-folder-request'
import { mergeSelectedWorktreeInbox } from './selected-worktree-paths'

describe('post import selection', () => {
  it('keeps selected worktrees other than the repo checkout', () => {
    const merged = mergeSelectedWorktreeInbox(undefined, undefined, '/home/user/project', [
      '/home/user/project',
      '/srv/wt/project'
    ])
    expect(merged).toEqual({
      importedExternalWorktreePaths: ['/srv/wt/project'],
      externalWorktreeInboxBaselinePaths: ['/srv/wt/project']
    })
    expect(
      mergeSelectedWorktreeInbox(['/srv/wt/project'], ['/srv/wt/project'], '/home/user/project', [
        '/srv/wt/project'
      ])
    ).toBeNull()
  })

  it('adds a non-git parent only when a selected child was imported or already known', () => {
    expect(
      parentFolderImportRequested({
        includeParentFolder: true,
        path: '/home/user/wt',
        importedProjects: [{ path: '/home/user/wt/app', status: 'failed' }]
      })
    ).toBe(false)
    expect(
      parentFolderImportRequested({
        includeParentFolder: true,
        path: '/home/user/wt',
        importedProjects: [{ path: '/home/user/wt/app', status: 'imported' }]
      })
    ).toBe(true)
    expect(
      parentFolderImportRequested({
        includeParentFolder: false,
        path: '/home/user/wt',
        importedProjects: [{ path: '/home/user/wt/app', status: 'already-known' }]
      })
    ).toBe(false)
  })

  it('notes the parent folder for a non-git scan and omits it for a git parent', () => {
    const projects = [{ path: '/home/user/wt/app', projectId: 'app', status: 'imported' }]
    expect(
      nestedHandoff(
        { selectedPath: '/home/user/wt', selectedPathKind: 'non_git_folder' },
        ['/home/user/wt/app'],
        { projects },
        null,
        'env-1'
      )
    ).toMatchObject({
      includeParentFolder: true,
      runtimeEnvironmentId: 'env-1',
      importedProjects: projects
    })
    expect(
      nestedHandoff(
        { selectedPath: '/home/user/project', selectedPathKind: 'git_repo' },
        ['/home/user/project'],
        { projects },
        'ssh-builder',
        null
      ).includeParentFolder
    ).toBe(false)
  })
})

describe('imported worktree path', () => {
  afterEach(() => {
    resetImportedWorktreePathForTests()
  })

  it('keeps the scan path until a resolver is registered', () => {
    expect(stampImportedWorktreePath({ path: '/srv/wt/project/.git', status: 'imported' })).toEqual(
      {
        path: '/srv/wt/project/.git',
        status: 'imported'
      }
    )
  })

  it('stores the resolved toplevel and drops it when it is the repo checkout', () => {
    registerImportedWorktreePath((repoPath) => repoPath.replace(/\/\.git$/, ''))
    const stamped = stampImportedWorktreePath({
      path: '/srv/wt/project/.git',
      projectId: 'project',
      status: 'imported'
    })
    expect(stamped.worktreePath).toBe('/srv/wt/project')
    const handoff = nestedHandoff(
      { selectedPath: '/home/user/wt', selectedPathKind: 'non_git_folder' },
      ['/srv/wt/project/.git'],
      { projects: [stamped] },
      null,
      'env-1'
    )
    expect(handoff.importedProjects?.[0]?.path).toBe('/srv/wt/project')
    expect(
      mergeSelectedWorktreeInbox(undefined, undefined, '/srv/wt/project', [
        handoff.importedProjects?.[0]?.path ?? ''
      ])
    ).toBeNull()
  })

  it('does not add a parent when direct SSH import failed every child', () => {
    expect(
      parentFolderImportRequested({
        includeParentFolder: true,
        path: '/remote/parent',
        importedProjects: [{ path: '/remote/parent/app', status: 'failed' }]
      })
    ).toBe(false)
  })
})
