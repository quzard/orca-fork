import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { REPOSITORY_PATH_REJECTED } from '../../git-workspace/constants'
import { clearWorkspaceRepositoryDiscoveryCache, discoverWorkspaceRepositories } from './discover'
import { locateWorkspaceRepository } from './guard'

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...args], {
    cwd,
    stdio: 'pipe'
  })
}

describe('workspace repository path guard', () => {
  let root = ''

  afterEach(() => {
    clearWorkspaceRepositoryDiscoveryCache()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects escapes and a swapped symlink, and accepts a discovered path', async () => {
    root = mkdtempSync(join(tmpdir(), 'orca-guard-'))
    const ws = join(root, 'ws')
    mkdirSync(ws)
    git(ws, ['init', '-b', 'main'])
    const app = join(ws, 'app')
    mkdirSync(app)
    git(app, ['init', '-b', 'main'])
    const found = await discoverWorkspaceRepositories(ws)
    const repositories = found.repositories
    await expect(locateWorkspaceRepository(ws, 'app', repositories)).resolves.toMatchObject({
      repositoryPath: 'app'
    })
    await expect(locateWorkspaceRepository(ws, '', repositories)).resolves.toMatchObject({
      repositoryPath: ''
    })
    for (const repositoryPath of ['..', 'foo/../../etc', '/etc/passwd', 'a\0b', 'missing']) {
      await expect(locateWorkspaceRepository(ws, repositoryPath, repositories)).rejects.toThrow(
        REPOSITORY_PATH_REJECTED
      )
    }
    rmSync(app, { recursive: true, force: true })
    const outside = mkdtempSync(join(tmpdir(), 'orca-outside-'))
    try {
      symlinkSync(outside, app)
      await expect(locateWorkspaceRepository(ws, 'app', repositories)).rejects.toThrow(
        REPOSITORY_PATH_REJECTED
      )
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
