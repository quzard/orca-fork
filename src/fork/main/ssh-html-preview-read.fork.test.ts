// 直连 SSH 的 HTML 预览：凭据目录不读，软链跳出目录不读，连上的 ssh2 把文件读回来。
import { EventEmitter } from 'node:events'
import { writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getConnection = vi.hoisted(() => vi.fn())

vi.mock('../../main/ssh/targets/ssh-target-registry', () => ({
  getSshConnectionManager: () => ({ getConnection })
}))

import { readConnectedSshHtmlPreview } from './ssh-html-preview-read'

const PAGE = '/home/admin/.answer-me-with-html/pages/x.html'
const PARENT = '/home/admin/.answer-me-with-html/pages'
const SYSTEM_SFTP_UNAVAILABLE = 'SFTP is not available when using system SSH transport'

function sftpOf(
  stats: { size: number; file: boolean },
  resolvePath: (path: string) => string,
  bytes: Buffer
) {
  const readFile = vi.fn((_path: string, callback: (error: null, data: Buffer) => void) => {
    callback(null, bytes)
  })
  return {
    end: vi.fn(),
    readFile,
    stat: (
      _path: string,
      callback: (error: null, stats: { size: number; isFile: () => boolean }) => void
    ) => callback(null, { size: stats.size, isFile: () => stats.file }),
    realpath: (path: string, callback: (error: null, resolved: string) => void) =>
      callback(null, resolvePath(path))
  }
}

function probeText(file: string, directory: string, size: number): string {
  return `${file}\n${directory}\n${size}\n`
}

function systemConnection(stdout: string, downloadFile = vi.fn()) {
  const exec = vi.fn(async () => {
    const channel = new EventEmitter()
    // exec 先返回，读取方挂上监听之后再出结果。同一拍里 emit 会赶在监听之前。
    setTimeout(() => {
      channel.emit('data', Buffer.from(stdout))
      channel.emit('exit', 0)
      channel.emit('close', 0)
    }, 0)
    return channel
  })
  return {
    exec,
    downloadFile,
    connection: {
      state: { status: 'connected' },
      sftp: () => Promise.reject(new Error(SYSTEM_SFTP_UNAVAILABLE)),
      downloadFile,
      exec
    }
  }
}

afterEach(() => {
  getConnection.mockReset()
})

describe('readConnectedSshHtmlPreview', () => {
  it('refuses a credential directory without opening the connection', async () => {
    await expect(
      readConnectedSshHtmlPreview('ssh-1', '/home/admin/.ssh/id_ed25519')
    ).resolves.toMatchObject({ ok: false, reason: 'unreadable' })
    expect(getConnection).not.toHaveBeenCalled()
  })

  it('returns null when the connection is not up', async () => {
    getConnection.mockReturnValue({ state: { status: 'disconnected' } })
    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toBeNull()
  })

  it('reads a regular file that stays inside its directory', async () => {
    const sftp = sftpOf({ size: 11, file: true }, (path) => path, Buffer.from('<p>hi</p>'))
    getConnection.mockReturnValue({
      state: { status: 'connected' },
      sftp: () => Promise.resolve(sftp),
      downloadFile: vi.fn()
    })

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toEqual({
      ok: true,
      bytes: Buffer.from('<p>hi</p>')
    })
    expect(sftp.end).toHaveBeenCalled()
  })

  it('refuses a symlink that leaves the file directory', async () => {
    const sftp = sftpOf(
      { size: 4, file: true },
      (path) => (path === PAGE ? '/etc/passwd' : PARENT),
      Buffer.from('nope')
    )
    getConnection.mockReturnValue({
      state: { status: 'connected' },
      sftp: () => Promise.resolve(sftp),
      downloadFile: vi.fn()
    })

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toMatchObject({
      ok: false,
      reason: 'unreadable'
    })
    expect(sftp.readFile).not.toHaveBeenCalled()
  })

  it('reads html under a symlinked parent directory', async () => {
    const realParent = '/data/home/admin/.answer-me-with-html/pages'
    const realFile = `${realParent}/x.html`
    const sftp = sftpOf(
      { size: 11, file: true },
      (path) => (path === PAGE ? realFile : realParent),
      Buffer.from('<p>hi</p>')
    )
    getConnection.mockReturnValue({
      state: { status: 'connected' },
      sftp: () => Promise.resolve(sftp),
      downloadFile: vi.fn()
    })

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toEqual({
      ok: true,
      bytes: Buffer.from('<p>hi</p>')
    })
    expect(sftp.readFile).toHaveBeenCalled()
  })

  it('refuses a file over the preview cap', async () => {
    const sftp = sftpOf({ size: 10 * 1024 * 1024 + 1, file: true }, (path) => path, Buffer.alloc(0))
    getConnection.mockReturnValue({
      state: { status: 'connected' },
      sftp: () => Promise.resolve(sftp),
      downloadFile: vi.fn()
    })

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toMatchObject({
      ok: false,
      reason: 'too-large'
    })
  })

  it('downloads through system SSH after the remote path stays inside its directory', async () => {
    const downloadFile = vi.fn(async (_remote: string, localPath: string) => {
      await writeFile(localPath, '<p>sys</p>')
    })
    const system = systemConnection(probeText(PAGE, PARENT, 11), downloadFile)
    getConnection.mockReturnValue(system.connection)

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toEqual({
      ok: true,
      bytes: Buffer.from('<p>sys</p>')
    })
    expect(system.exec).toHaveBeenCalledWith(expect.stringContaining('realpath -e'))
    expect(downloadFile).toHaveBeenCalledWith(PAGE, expect.stringMatching(/page$/))
  })

  it('refuses a system-SSH symlink into a credential directory before downloading', async () => {
    const system = systemConnection(probeText('/home/admin/.ssh/id_rsa', PARENT, 100))
    getConnection.mockReturnValue(system.connection)

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toMatchObject({
      ok: false,
      reason: 'unreadable'
    })
    expect(system.downloadFile).not.toHaveBeenCalled()
  })

  it('checks system-SSH size before downloading', async () => {
    const system = systemConnection(probeText(PAGE, PARENT, 10 * 1024 * 1024 + 1))
    getConnection.mockReturnValue(system.connection)

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toMatchObject({
      ok: false,
      reason: 'too-large'
    })
    expect(system.downloadFile).not.toHaveBeenCalled()
  })

  it('accepts system-SSH html when the parent directory is a symlink', async () => {
    const realParent = '/data/home/admin/.answer-me-with-html/pages'
    const realFile = `${realParent}/x.html`
    const downloadFile = vi.fn(async (_remote: string, localPath: string) => {
      await writeFile(localPath, '<p>link</p>')
    })
    const system = systemConnection(probeText(realFile, realParent, 12), downloadFile)
    getConnection.mockReturnValue(system.connection)

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toEqual({
      ok: true,
      bytes: Buffer.from('<p>link</p>')
    })
    expect(downloadFile).toHaveBeenCalledWith(realFile, expect.stringMatching(/page$/))
  })
})
