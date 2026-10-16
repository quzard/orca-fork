import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { resolvePosixBrowseCommandTail } from '../../shared/fork-hooks/remote-directory'
import { registerForkMainModules } from '../register-main'
import { POSIX_SYMLINK_DIRECTORY_LIST_TAIL } from './posix-symlink-list'

const tailBeforeRegistration = resolvePosixBrowseCommandTail()

describe('posix symlink directory listing', () => {
  it('leaves the upstream listing command in place until the main modules register', () => {
    expect(tailBeforeRegistration).toBeUndefined()
  })

  it('marks a directory symlink over local sshd and leaves a dangling link as a file', () => {
    const output = execFileSync('bash', ['fork/scripts/verify/ssh-symlink-directory-follow.sh'], {
      env: { ...process.env, POSIX_SYMLINK_DIRECTORY_LIST_TAIL },
      encoding: 'utf8',
      timeout: 30_000
    })
    expect(output).toContain('ssh: directory symlink is selectable')
    expect(output).toContain('link-dir/')
  })

  it('installs that tail from the main registration', () => {
    registerForkMainModules()
    expect(resolvePosixBrowseCommandTail()).toBe(POSIX_SYMLINK_DIRECTORY_LIST_TAIL)
  })
})
