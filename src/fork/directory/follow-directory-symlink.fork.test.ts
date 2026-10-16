import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { followDirectorySymlinks } from './follow-directory-symlink'

describe('followDirectorySymlinks', () => {
  it('selects a directory symlink and keeps a dangling link as a file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-dir-link-'))
    await mkdir(join(root, 'real-dir'))
    await writeFile(join(root, 'real-dir', 'file.txt'), 'sample')
    await symlink('real-dir', join(root, 'link-dir'))
    await symlink('missing', join(root, 'dangling'))

    const entries = await followDirectorySymlinks(
      [
        { name: 'real-dir', isDirectory: true, isSymlink: false },
        { name: 'link-dir', isDirectory: false, isSymlink: true },
        { name: 'dangling', isDirectory: false, isSymlink: true },
        { name: 'notes.txt', isDirectory: false }
      ],
      root
    )

    expect(entries).toEqual([
      { name: 'real-dir', isDirectory: true, isSymlink: false },
      { name: 'link-dir', isDirectory: true, isSymlink: true },
      { name: 'dangling', isDirectory: false, isSymlink: true },
      { name: 'notes.txt', isDirectory: false }
    ])
  })
})
