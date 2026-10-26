// 托管 orcad：没有工作区认领的路径，文件存在就发只读授权。未登记时不 stat。凭据目录不发。
import { mkdtempSync } from 'node:fs'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openManagedDisownedHostFile } from './disowned-host-file-open'
import { registerDisownedHostFileOpen } from '../../shared/fork-hooks/terminal-disowned-host-file'

// os.homedir() 先看 HOME。临时目录放在当前工作目录下，本机没有固定绝对路径时也能建出来。凭据路径不会写进真实的 ~/.orca。
const fakeHome = mkdtempSync(join(process.cwd(), '.vitest-disowned-home-'))
const realHome = process.env.HOME

function restoreHome(): void {
  if (realHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = realHome
  }
}

afterAll(async () => {
  restoreHome()
  await rm(fakeHome, { recursive: true, force: true })
})
import {
  createRuntimeFileCommands,
  useRuntimeFileCommandsLifecycle
} from '../../main/runtime/orca-runtime-files-test-harness'
import {
  absoluteFileTarget,
  statAsFile,
  useTerminalArtifactTempFiles
} from '../../main/runtime/orca-runtime-files-terminal-artifact-fixtures'

vi.mock('fs', async () =>
  (await import('../../main/runtime/orca-runtime-files-mock-registry')).fsModuleMock()
)
vi.mock('fs/promises', async () =>
  (await import('../../main/runtime/orca-runtime-files-mock-registry')).fsPromisesModuleMock()
)
vi.mock(
  '../../main/runtime/file-watcher-host',
  async () =>
    (await import('../../main/runtime/orca-runtime-files-mock-registry')).fileWatcherHostMock
)
vi.mock('../../main/ipc/filesystem/filesystem-auth', async () =>
  (await import('../../main/runtime/orca-runtime-files-mock-registry')).filesystemAuthModuleMock()
)
vi.mock('../../main/git/runner', async () =>
  (await import('../../main/runtime/orca-runtime-files-mock-registry')).gitRunnerModuleMock()
)
vi.mock(
  '../../main/ipc/local-worktree-runtime-options',
  async () =>
    (await import('../../main/runtime/orca-runtime-files-mock-registry'))
      .localWorktreeRuntimeOptionsMock
)

const extraDirs: string[] = []

const outsideRoots = async (name: string, content?: string): Promise<string> => {
  const dir = await mkdtemp(join(fakeHome, 'orca-disowned-'))
  extraDirs.push(dir)
  const filePath = join(dir, name)
  if (content !== undefined) {
    await writeFile(filePath, content)
  }
  return filePath
}

describe('a managed host file no workspace owns', () => {
  useRuntimeFileCommandsLifecycle()
  const { tempFile } = useTerminalArtifactTempFiles()

  beforeEach(() => {
    process.env.HOME = fakeHome
  })

  afterEach(async () => {
    restoreHome()
    registerDisownedHostFileOpen(null)
    await Promise.all(extraDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  const allow = (): void => {
    registerDisownedHostFileOpen(openManagedDisownedHostFile)
  }

  const credentialFile = async (dirName: string, name: string): Promise<string> => {
    const root = join(fakeHome, dirName)
    await mkdir(root, { recursive: true })
    const dir = await mkdtemp(join(root, 'orca-disowned-'))
    extraDirs.push(dir)
    const filePath = join(dir, name)
    await writeFile(filePath, 'secret')
    return filePath
  }

  const disownedHost = () =>
    createRuntimeFileCommands({
      path: '/repo',
      resolveKnownWorkspaceFileTarget: vi.fn(async () => null)
    })

  it('returns exists:false without a grant when the hook is off, even if the file exists', async () => {
    const filePath = await outsideRoots('x.html', '<p>hi</p>')
    const { commands } = disownedHost()

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      filePath,
      null,
      'client-a',
      null,
      true,
      null
    )

    expect(result).toMatchObject({
      worktree: 'wt-1',
      relativePath: null,
      exists: false,
      isDirectory: false
    })
    expect(result.openTarget).toBeUndefined()
  })

  it('grants a read-only open for a chat link with no terminal handle and no native chat context', async () => {
    allow()
    const filePath = await outsideRoots('page.html', '<p>hi</p>')
    const { commands } = disownedHost()

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      filePath,
      null,
      'client-a',
      null,
      true,
      null
    )

    expect(result).toMatchObject({
      worktree: 'wt-1',
      relativePath: null,
      exists: true,
      isDirectory: false,
      openTarget: { kind: 'absolute-file', readOnly: true }
    })
    const target = absoluteFileTarget(result)
    await expect(
      commands.writeTerminalArtifactFile(
        'id:wt-1',
        target.grantId,
        target.absolutePath,
        'changed',
        'client-a'
      )
    ).rejects.toThrow('terminal_file_grant_read_only')
  })

  it('still grants when the terminal printed nothing and the path is outside artifact roots', async () => {
    allow()
    const filePath = await outsideRoots('notes.txt', 'notes')
    expect(filePath.startsWith(tmpdir())).toBe(false)
    const hasRecentTerminalOutputPath = vi.fn(() => false)
    const { commands } = createRuntimeFileCommands({
      path: '/repo',
      resolveKnownWorkspaceFileTarget: vi.fn(async () => null),
      hasRecentTerminalOutputPath,
      resolveTerminalCwd: vi.fn(() => '/repo')
    })

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      filePath,
      null,
      'client-a',
      'term-1',
      true
    )

    expect(hasRecentTerminalOutputPath).not.toHaveBeenCalled()
    expect(result.openTarget).toMatchObject({ kind: 'absolute-file', readOnly: true })
  })

  it('still grants when recent terminal output does not match a temp path', async () => {
    allow()
    const filePath = await tempFile('printed.txt', 'output')
    const hasRecentTerminalOutputPath = vi.fn(() => false)
    const { commands } = createRuntimeFileCommands({
      path: '/repo',
      resolveKnownWorkspaceFileTarget: vi.fn(async () => null),
      hasRecentTerminalOutputPath
    })

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      filePath,
      null,
      'client-a',
      'term-1',
      true
    )

    expect(hasRecentTerminalOutputPath).toHaveBeenCalled()
    expect(result.openTarget).toMatchObject({ kind: 'absolute-file', readOnly: true })
  })

  it('keeps exists:false when the host disowns a path that is not on disk', async () => {
    allow()
    const filePath = await outsideRoots('missing.html')
    const { commands } = disownedHost()

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      filePath,
      null,
      'client-a',
      null,
      true
    )

    expect(result).toMatchObject({ relativePath: null, exists: false })
    expect(result.openTarget).toBeUndefined()
  })

  it('does not grant a directory', async () => {
    allow()
    const dir = await mkdtemp(join(fakeHome, 'orca-disowned-dir-'))
    extraDirs.push(dir)
    const { commands } = disownedHost()

    const result = await commands.resolveTerminalPath('id:wt-1', dir, null, 'client-a', null, true)

    expect(result.isDirectory).toBe(true)
    expect(result.openTarget?.kind).not.toBe('absolute-file')
  })

  it('does not grant when crossWorkspace is off', async () => {
    allow()
    const filePath = await outsideRoots('quiet.txt', 'x')
    const { commands } = disownedHost()

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      filePath,
      null,
      'client-a',
      null,
      false
    )

    expect(result).toMatchObject({ exists: false })
    expect(result.openTarget).toBeUndefined()
  })

  it('does not stat this machine for an SSH workspace the host disowns', async () => {
    allow()
    const filePath = await outsideRoots('ssh.html', '<p>ssh</p>')
    const { commands, store } = disownedHost()
    store.getRepo.mockReturnValue({ connectionId: 'ssh-1' })

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      filePath,
      null,
      'client-a',
      null,
      true
    )

    expect(result).toMatchObject({ relativePath: null, exists: false })
    expect(result.openTarget).toBeUndefined()
  })

  it('keeps a sibling workspace that owns the path, instead of a disowned grant', async () => {
    allow()
    const sibling = {
      id: 'folder:home',
      repoId: 'repo-home',
      path: '/home/dev',
      git: { path: '/home/dev', head: '', branch: '', isBare: false, isMainWorktree: true }
    }
    const { commands } = createRuntimeFileCommands({
      path: '/repo',
      resolveKnownWorkspaceFileTarget: vi.fn(async () => ({
        worktree: sibling,
        executionHostId: 'local',
        relativePath: '.demo-pages/x.html'
      }))
    })
    statAsFile()

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      '/home/dev/.demo-pages/x.html',
      null,
      'client-a',
      null,
      true
    )

    expect(result).toMatchObject({
      worktree: 'folder:home',
      relativePath: '.demo-pages/x.html',
      openTarget: { kind: 'worktree-file' }
    })
  })

  it.each(['.ssh', '.gnupg', '.orca', '.aws'] as const)(
    'does not grant a file under %s',
    async (dirName) => {
      allow()
      const filePath = await credentialFile(dirName, 'secret')
      const { commands } = disownedHost()

      const result = await commands.resolveTerminalPath(
        'id:wt-1',
        filePath,
        null,
        'client-a',
        null,
        true,
        null
      )

      expect(result).toMatchObject({ relativePath: null, exists: false, isDirectory: false })
      expect(result.openTarget).toBeUndefined()
    }
  )

  it('does not grant a symlink that lands in a credential directory', async () => {
    allow()
    const secret = await credentialFile('.ssh', 'id_ed25519')
    const linkDir = await mkdtemp(join(fakeHome, 'orca-disowned-link-'))
    extraDirs.push(linkDir)
    const link = join(linkDir, 'id')
    await symlink(secret, link)
    const { commands } = disownedHost()

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      link,
      null,
      'client-a',
      null,
      true,
      null
    )

    expect(result).toMatchObject({ exists: false })
    expect(result.openTarget).toBeUndefined()
  })

  it('still grants a path whose name only starts like a credential directory', async () => {
    allow()
    const dir = await mkdtemp(join(fakeHome, '.ssh-backup-'))
    extraDirs.push(dir)
    const filePath = join(dir, 'notes.txt')
    await writeFile(filePath, 'notes')
    const { commands } = disownedHost()

    const result = await commands.resolveTerminalPath(
      'id:wt-1',
      filePath,
      null,
      'client-a',
      null,
      true,
      null
    )

    expect(result.openTarget).toMatchObject({ kind: 'absolute-file', readOnly: true })
  })
})
